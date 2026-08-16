import type { AgentConfigInput } from '@provenance-streams/agent';
import { isAddress } from 'viem';
import { z } from 'zod';

const addressSchema = z.string().refine(isAddress, { message: 'Must be a valid EVM address' });

const circleSchema = z.object({
  apiKey: z.string().min(1),
  entitySecret: z.string().min(1),
  appId: z.string().min(1),
  treasuryWalletId: z.string().min(1),
  treasuryBlockchain: z.string().min(1),
});

const embeddedWalletSchema = z.object({
  apiKey: z.string().min(1),
  appId: z.string().min(1),
});

const serverConfigSchema = z.object({
  port: z.coerce.number().int().positive().default(4000),
  corsOrigin: z.string().min(1).default('http://localhost:5173'),
  rpcUrl: z.string().url(),
  chainId: z.coerce.number().int().positive(),
  attestationRegistryAddress: addressSchema,
  rewardPolicyAddress: addressSchema,
  rewardDispatcherAddress: addressSchema,
  decisionRegistryAddress: addressSchema,
  operatorPrivateKey: z.string().min(1),
  treasuryPrivateKey: z.string().optional(),
  /** Shared secret gating every admin route (see docs/decisions.md) — required, no default, so the server refuses to boot without one rather than silently running unauthenticated. Kept as a bootstrap/break-glass credential now that `adminEmails` below is the primary path. */
  adminToken: z.string().min(1),
  /** Comma-separated allowlist of emails allowed to complete OTP login as `role: 'admin'` (see `POST /api/auth/email/complete`). Empty/unset means email-based admin login is off — `adminToken` is still the only way in. */
  adminEmails: z.string().optional(),
  /** Postgres connection string — required, no default, so the server refuses to boot without persistence rather than silently falling back to nothing. */
  databaseUrl: z.string().min(1),
  circle: circleSchema.partial(),
  geminiApiKey: z.string().optional(),
  geminiModel: z.string().min(1).default('gemini-flash-latest'),
  nvidiaApiKey: z.string().optional(),
  nvidiaDeepseekModel: z.string().min(1).default('deepseek-ai/deepseek-v4-flash'),
  nvidiaMistralModel: z.string().min(1).default('mistralai/mixtral-8x22b-instruct-v0.1'),
  rewardPolicyDeployedAtBlock: z.coerce.bigint().default(0n),
  attestationRegistryDeployedAtBlock: z.coerce.bigint().optional(),
  rewardDispatcherDeployedAtBlock: z.coerce.bigint().optional(),
  fraudScoreThreshold: z.coerce.number().int().min(0).max(100).optional(),
});

export interface ServerConfig {
  port: number;
  corsOrigin: string;
  adminToken: string;
  /** Lower-cased, trimmed emails allowed to become `role: 'admin'` via OTP login. */
  adminEmails: string[];
  databaseUrl: string;
  rpcUrl: string;
  chainId: number;
  attestationRegistryAddress: `0x${string}`;
  rewardPolicyAddress: `0x${string}`;
  rewardDispatcherAddress: `0x${string}`;
  decisionRegistryAddress: `0x${string}`;
  /** Block `RewardPolicy` was deployed at, so `PolicyService` doesn't scan from genesis. */
  rewardPolicyDeployedAtBlock: bigint;
  /** Block `AttestationRegistry` was deployed at, for `HistoryService`'s backfill. Falls back to `rewardPolicyDeployedAtBlock` (Ignition deploys all three contracts in one run, blocks apart at most). */
  attestationRegistryDeployedAtBlock: bigint;
  /** Block `RewardDispatcher` was deployed at, for `HistoryService`'s backfill. Same fallback as above. */
  rewardDispatcherDeployedAtBlock: bigint;
  /** Full agent config, ready to pass to `runAgent`. */
  agentConfig: AgentConfigInput;
  /** Present only when the full Circle credential set is configured for the treasury DCW. */
  circle:
    | {
        apiKey: string;
        entitySecret: string;
        appId: string;
        treasuryWalletId: string;
        treasuryBlockchain: string;
      }
    | undefined;
  /**
   * Present whenever `CIRCLE_API_KEY` / `CIRCLE_APP_ID` are set, independent of
   * whether the full treasury credential set (above) is also configured —
   * embedded wallets don't need `entitySecret` or a treasury wallet id.
   */
  embeddedWallet: { apiKey: string; appId: string } | undefined;
  /** Present only when `GEMINI_API_KEY` is configured for AI risk analysis. */
  gemini: { apiKey: string; model: string } | undefined;
  /** Present only when `NVIDIA_API_KEY` is configured — a fallback risk-analysis provider (DeepSeek/Mistral via NVIDIA's NIM catalog) for when Gemini is unavailable. */
  nvidia: { apiKey: string; deepseekModel: string; mistralModel: string } | undefined;
}

/**
 * Loads and validates environment configuration for the backend process,
 * including the agent's treasury mode: Circle Developer Controlled Wallet if
 * `CIRCLE_API_KEY` / `CIRCLE_ENTITY_SECRET` / `CIRCLE_TREASURY_WALLET_ID` are
 * all set, otherwise a local signer via `TREASURY_PRIVATE_KEY` for the demo.
 */
export function loadServerConfig(): ServerConfig {
  const raw = serverConfigSchema.parse({
    port: process.env.PORT,
    corsOrigin: process.env.CORS_ORIGIN,
    rpcUrl: process.env.RPC_URL,
    chainId: process.env.CHAIN_ID,
    attestationRegistryAddress: process.env.CONTRACT_ADDRESS,
    rewardPolicyAddress: process.env.REWARD_POLICY_ADDRESS,
    rewardDispatcherAddress: process.env.REWARD_DISPATCHER_ADDRESS,
    decisionRegistryAddress: process.env.DECISION_REGISTRY_ADDRESS,
    operatorPrivateKey: process.env.OPERATOR_PRIVATE_KEY,
    treasuryPrivateKey: process.env.TREASURY_PRIVATE_KEY,
    adminToken: process.env.ADMIN_TOKEN,
    adminEmails: process.env.ADMIN_EMAILS,
    databaseUrl: process.env.DATABASE_URL,
    circle: {
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET,
      appId: process.env.CIRCLE_APP_ID,
      treasuryWalletId: process.env.CIRCLE_TREASURY_WALLET_ID,
      treasuryBlockchain: process.env.CIRCLE_TREASURY_BLOCKCHAIN,
    },
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL,
    nvidiaApiKey: process.env.NVIDIA_API_KEY,
    nvidiaDeepseekModel: process.env.NVIDIA_DEEPSEEK_MODEL,
    nvidiaMistralModel: process.env.NVIDIA_MISTRAL_MODEL,
    rewardPolicyDeployedAtBlock: process.env.REWARD_POLICY_DEPLOYED_AT_BLOCK,
    attestationRegistryDeployedAtBlock: process.env.ATTESTATION_REGISTRY_DEPLOYED_AT_BLOCK,
    rewardDispatcherDeployedAtBlock: process.env.REWARD_DISPATCHER_DEPLOYED_AT_BLOCK,
    fraudScoreThreshold: process.env.FRAUD_SCORE_THRESHOLD,
  });

  const circleParsed = circleSchema.safeParse(raw.circle);
  const embeddedWalletParsed = embeddedWalletSchema.safeParse(raw.circle);
  const treasury: AgentConfigInput['treasury'] = circleParsed.success
    ? {
        mode: 'circle',
        apiKey: circleParsed.data.apiKey,
        entitySecret: circleParsed.data.entitySecret,
        walletId: circleParsed.data.treasuryWalletId,
        blockchain: circleParsed.data.treasuryBlockchain,
      }
    : {
        mode: 'local',
        privateKey: requireTreasuryPrivateKey(raw.treasuryPrivateKey),
      };

  return {
    port: raw.port,
    corsOrigin: raw.corsOrigin,
    adminToken: raw.adminToken,
    adminEmails: (raw.adminEmails ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
    databaseUrl: raw.databaseUrl,
    rpcUrl: raw.rpcUrl,
    chainId: raw.chainId,
    attestationRegistryAddress: raw.attestationRegistryAddress,
    rewardPolicyAddress: raw.rewardPolicyAddress,
    rewardDispatcherAddress: raw.rewardDispatcherAddress,
    decisionRegistryAddress: raw.decisionRegistryAddress,
    rewardPolicyDeployedAtBlock: raw.rewardPolicyDeployedAtBlock,
    attestationRegistryDeployedAtBlock:
      raw.attestationRegistryDeployedAtBlock ?? raw.rewardPolicyDeployedAtBlock,
    rewardDispatcherDeployedAtBlock:
      raw.rewardDispatcherDeployedAtBlock ?? raw.rewardPolicyDeployedAtBlock,
    agentConfig: {
      rpcUrl: raw.rpcUrl,
      chainId: raw.chainId,
      attestationRegistryAddress: raw.attestationRegistryAddress,
      rewardPolicyAddress: raw.rewardPolicyAddress,
      rewardDispatcherAddress: raw.rewardDispatcherAddress,
      operatorPrivateKey: raw.operatorPrivateKey,
      treasury,
      fraudScoreThreshold: raw.fraudScoreThreshold,
    },
    circle: circleParsed.success
      ? {
          apiKey: circleParsed.data.apiKey,
          entitySecret: circleParsed.data.entitySecret,
          appId: circleParsed.data.appId,
          treasuryWalletId: circleParsed.data.treasuryWalletId,
          treasuryBlockchain: circleParsed.data.treasuryBlockchain,
        }
      : undefined,
    embeddedWallet: embeddedWalletParsed.success ? embeddedWalletParsed.data : undefined,
    gemini: raw.geminiApiKey ? { apiKey: raw.geminiApiKey, model: raw.geminiModel } : undefined,
    nvidia: raw.nvidiaApiKey
      ? {
          apiKey: raw.nvidiaApiKey,
          deepseekModel: raw.nvidiaDeepseekModel,
          mistralModel: raw.nvidiaMistralModel,
        }
      : undefined,
  };
}

function requireTreasuryPrivateKey(value: string | undefined): string {
  if (!value) {
    throw new Error(
      'No treasury configured: set CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, and CIRCLE_TREASURY_WALLET_ID ' +
        'for a real Developer Controlled Wallet, or TREASURY_PRIVATE_KEY for the local demo signer.',
    );
  }
  return value;
}
