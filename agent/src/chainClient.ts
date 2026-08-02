import { arcTestnet, hardhatLocal } from '@provenance-streams/protocol';
import type { Account, Chain, Hex, HttpTransport, PublicClient, WalletClient } from 'viem';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface ChainConfig {
  rpcUrl: string;
  chainId: number;
}

/** Stops an event subscription started by `watchAttestations` or `watchRewardEligible`. */
export type StopWatcher = () => void;

/**
 * Resolves the chain definition matching `chainId`. Known chains (local Hardhat,
 * Arc testnet) get their real name and native currency; anything else falls back
 * to a generic definition so an unrecognized `CHAIN_ID` still works.
 */
function resolveChain(chainId: number): Chain {
  if (chainId === arcTestnet.id) {
    return arcTestnet;
  }
  if (chainId === hardhatLocal.id) {
    return hardhatLocal;
  }
  return { ...hardhatLocal, id: chainId, name: `Chain ${chainId.toString()}` };
}

/** A read-only client for the agent's configured chain. */
export function createAgentPublicClient(config: ChainConfig): PublicClient<HttpTransport, Chain> {
  return createPublicClient({
    chain: resolveChain(config.chainId),
    transport: http(config.rpcUrl),
  });
}

/** A signing client for the agent's operator account on its configured chain. */
export function createAgentWalletClient(
  config: ChainConfig & { privateKey: Hex },
): WalletClient<HttpTransport, Chain, Account> {
  return createWalletClient({
    account: privateKeyToAccount(config.privateKey),
    chain: resolveChain(config.chainId),
    transport: http(config.rpcUrl),
  });
}
