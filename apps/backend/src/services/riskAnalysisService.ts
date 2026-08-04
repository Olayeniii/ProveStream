import { z } from 'zod';

export interface RiskAnalysisServiceConfig {
  apiKey: string;
  model: string;
}

export interface RiskAnalysisResult {
  score: number;
  confidence: number;
  summary: string;
}

const resultSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  summary: z.string().min(1),
});

function buildPrompt(evidenceText: string, policyId: string): string {
  return [
    'You are a fraud-risk reviewer for supply-chain attestations submitted by field auditors.',
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

/**
 * Calls Google's Gemini API directly over `fetch` (no SDK dependency, matching
 * this project's otherwise-lean dependency footprint) to score an attestation's
 * submitted evidence text. Only constructed when `GEMINI_API_KEY` is configured;
 * see `apps/backend/src/main.ts`.
 */
export class RiskAnalysisService {
  constructor(private readonly config: RiskAnalysisServiceConfig) {}

  async analyzeEvidence(input: {
    evidenceText: string;
    policyId: string;
  }): Promise<RiskAnalysisResult> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(input.evidenceText, input.policyId) }] }],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini request failed with status ${response.status.toString()}`);
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
