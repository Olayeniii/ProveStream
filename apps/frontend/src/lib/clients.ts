import { hardhatLocal } from '@provenance-streams/protocol';
import type { PublicClient, WalletClient } from 'viem';
import { createPublicClient, createWalletClient, custom, http } from 'viem';

import type { AppEnv } from '../env.js';

/** A read-only client for the configured chain, used to await transaction receipts. */
export function getPublicClient(env: AppEnv): PublicClient {
  return createPublicClient({
    chain: { ...hardhatLocal, id: env.chainId },
    transport: http(env.rpcUrl),
  });
}

/**
 * Requests access to the browser's injected wallet (e.g. MetaMask) and
 * returns a viem wallet client for the connected account.
 *
 * This is the integration point future milestones will swap for Arc App
 * Kit / a Developer Controlled Wallet, without touching the form or
 * transaction-result UI that call it.
 */
export async function connectWallet(env: AppEnv): Promise<WalletClient> {
  if (!window.ethereum) {
    throw new Error('No wallet found. Install a browser wallet like MetaMask to continue.');
  }

  const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!account) {
    throw new Error('Wallet connection was rejected.');
  }

  return createWalletClient({
    account,
    chain: { ...hardhatLocal, id: env.chainId },
    transport: custom(window.ethereum),
  });
}
