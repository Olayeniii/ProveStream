import { z } from 'zod';

export interface RiskAnalysisResult {
  score: number;
  confidence: number;
  summary: string;
  /** Which model actually produced this result — surfaced to the frontend so a fallback firing is visible, not hidden. */
  provider: string;
}

const resultSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  summary: z.string().min(1),
});

function buildPrompt(evidenceText: string, policyId: string): string {
  return [
    'You are a fraud-risk reviewer for supply-chain attestations submitted by field auditors.',
    // Models have no inherent notion of "today" beyond their training cutoff —
    // without this, any 2026+ date looks "impossible"/"in the future" to them,
    // which was producing confidently wrong date-inconsistency claims.
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    `The auditor is claiming eligibility under reward policy #${policyId} and submitted this evidence:`,
    '"""',
    evidenceText,
    '"""',
    '',
    'Assess how plausible this evidence is and flag any inconsistencies, vagueness, or signs of',
    'fabrication. Respond with ONLY a single JSON object, no markdown fences, no other text:',
    '{"score": <integer 0-100 fraud risk, higher = riskier>, "confidence": <integer 0-100>, "summary": "<one sentence>"}',
  ].join('\n');
}

function extractJson(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(stripped);
}

/** One model this service can ask to score evidence — implemented by `GeminiProvider` and `NvidiaProvider` below. */
export interface RiskAnalysisProvider {
  /** Shown to the frontend as the source of a result, e.g. "Gemini" or "DeepSeek R1 (NVIDIA)". */
  readonly name: string;
  analyze(evidenceText: string, policyId: string): Promise<Omit<RiskAnalysisResult, 'provider'>>;
}

/**
 * Calls Google's Gemini API directly over `fetch` (no SDK dependency, matching
 * this project's otherwise-lean dependency footprint) to score an attestation's
 * submitted evidence text.
 */
export class GeminiProvider implements RiskAnalysisProvider {
  readonly name = 'Gemini';

  constructor(private readonly config: { apiKey: string; model: string }) {}

  async analyze(
    evidenceText: string,
    policyId: string,
  ): Promise<Omit<RiskAnalysisResult, 'provider'>> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(evidenceText, policyId) }] }],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Gemini request failed with status ${response.status.toString()}: ${await response.text()}`,
      );
    }

    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini did not return a response.');
    }

    return resultSchema.parse(extractJson(text));
  }
}

/**
 * Calls a model hosted on NVIDIA's NIM catalog (build.nvidia.com) via its
 * OpenAI-compatible `/v1/chat/completions` endpoint — one API key, any
 * model NVIDIA exposes through it (DeepSeek, Mistral, Llama, ...), selected
 * by `config.model`. Used as a backup when Gemini is unavailable (e.g. its
 * free-tier quota is exhausted — a real, observed failure mode, not
 * hypothetical) so risk analysis keeps working instead of going dark.
 */
export class NvidiaProvider implements RiskAnalysisProvider {
  constructor(
    readonly name: string,
    private readonly config: { apiKey: string; model: string; extraBody?: Record<string, unknown> },
  ) {}

  async analyze(
    evidenceText: string,
    policyId: string,
  ): Promise<Omit<RiskAnalysisResult, 'provider'>> {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: buildPrompt(evidenceText, policyId) }],
        temperature: 0.2,
        max_tokens: 512,
        stream: false,
        ...this.config.extraBody,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `NVIDIA (${this.config.model}) request failed with status ${response.status.toString()}: ${await response.text()}`,
      );
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error(`NVIDIA (${this.config.model}) did not return a response.`);
    }

    return resultSchema.parse(extractJson(text));
  }
}

/**
 * Scores an attestation's submitted evidence text for fraud risk, trying
 * each configured `RiskAnalysisProvider` in order and falling back to the
 * next on failure — a quota-exhausted or otherwise-down provider degrades
 * to a backup instead of taking the whole feature offline. Only throws once
 * every provider has failed, with all their errors attached for logging.
 */
export class RiskAnalysisService {
  constructor(private readonly providers: readonly RiskAnalysisProvider[]) {
    if (providers.length === 0) {
      throw new Error('RiskAnalysisService needs at least one provider.');
    }
  }

  async analyzeEvidence(input: {
    evidenceText: string;
    policyId: string;
  }): Promise<RiskAnalysisResult> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        const result = await provider.analyze(input.evidenceText, input.policyId);
        return { ...result, provider: provider.name };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Risk analysis provider "${provider.name}" failed, trying next:`, message);
        errors.push(`${provider.name}: ${message}`);
      }
    }
    throw new Error(`All risk analysis providers failed:\n${errors.join('\n')}`);
  }
}
