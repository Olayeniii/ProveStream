import type { Hex } from 'viem';
import { isAddress } from 'viem';
import { z } from 'zod';

function isPrivateKeyHex(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

const addressSchema = z.string().refine(isAddress, { message: 'Must be a valid EVM address' });
const privateKeySchema = z
  .string()
  .refine(isPrivateKeyHex, { message: 'Must be a 32-byte hex private key (0x-prefixed)' });

const circleTreasuryConfigSchema = z.object({
  mode: z.literal('circle'),
  apiKey: z.string().min(1),
  entitySecret: z.string().min(1),
  walletId: z.string().min(1),
  blockchain: z.string().min(1),
});

const localTreasuryConfigSchema = z.object({
  mode: z.literal('local'),
  privateKey: privateKeySchema,
});

export const treasuryConfigSchema = z.discriminatedUnion('mode', [
  circleTreasuryConfigSchema,
  localTreasuryConfigSchema,
]);

export const agentConfigSchema = z.object({
  rpcUrl: z.string().url(),
  chainId: z.coerce.number().int().positive(),
  attestationRegistryAddress: addressSchema,
  rewardPolicyAddress: addressSchema,
  rewardDispatcherAddress: addressSchema,
  operatorPrivateKey: privateKeySchema,
  treasury: treasuryConfigSchema,
  /** Score at or above which `FraudService` holds a payout for admin review instead of auto-dispatching. Defaults to `FraudService`'s own default (70) when unset. */
  fraudScoreThreshold: z.coerce.number().int().min(0).max(100).optional(),
});

export type TreasuryConfig = z.infer<typeof treasuryConfigSchema>;
export type AgentConfigInput = z.input<typeof agentConfigSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;

/** Parses and validates raw agent configuration, throwing a clear error on failure. */
export function parseAgentConfig(input: AgentConfigInput): AgentConfig {
  return agentConfigSchema.parse(input);
}
