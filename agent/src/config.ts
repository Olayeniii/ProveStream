import { isAddress } from 'viem';
import { z } from 'zod';

export const agentConfigSchema = z.object({
  rpcUrl: z.string().url(),
  contractAddress: z.string().refine(isAddress, { message: 'Must be a valid EVM address' }),
  chainId: z.coerce.number().int().positive(),
});

export type AgentConfigInput = z.input<typeof agentConfigSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;

/** Parses and validates raw agent configuration, throwing a clear error on failure. */
export function parseAgentConfig(input: AgentConfigInput): AgentConfig {
  return agentConfigSchema.parse(input);
}
