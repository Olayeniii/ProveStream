import { arcTestnet, hardhatLocal } from '@provenance-streams/protocol';
import type { Chain, PublicClient, WalletClient } from 'viem';
import { createPublicClient, createWalletClient, custom, http } from 'viem';

import type { AppEnv } from '../env.js';

/**
 * Resolves the configured chain's real definition (name, native currency,
 * block explorer) by id, instead of assuming local Hardhat — prompts and
 * error messages shown by the injected wallet (e.g. "wrong network") need
 * the real name to make sense once `VITE_CHAIN_ID` points at Arc testnet.
 */
function resolveChain(env: AppEnv): Chain {
  if (env.chainId === arcTestnet.id) {
    return arcTestnet;
  }
  if (env.chainId === hardhatLocal.id) {
    return hardhatLocal;
  }
  return { ...hardhatLocal, id: env.chainId, name: `Chain ${env.chainId.toString()}` };
}

/** A read-only client for the configured chain, used to await transaction receipts. */
export function getPublicClient(env: AppEnv): PublicClient {
  return createPublicClient({
    chain: resolveChain(env),
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

  await ensureCorrectNetwork(env);

  return createWalletClient({
    account,
    chain: resolveChain(env),
    transport: custom(window.ethereum),
  });
}

/**
 * Switches the injected wallet to the configured chain, adding it first if
 * the wallet doesn't already know about it (error code 4902). Without this,
 * a wallet left on e.g. Ethereum Mainnet only finds out it's on the wrong
 * network when the contract call itself fails — this asks upfront instead.
 */
async function ensureCorrectNetwork(env: AppEnv): Promise<void> {
  const chain = resolveChain(env);
  const chainIdHex = `0x${chain.id.toString(16)}`;

  try {
    await window.ethereum!.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    const code = (error as { code?: number } | undefined)?.code;
    if (code !== 4902) {
      throw error;
    }

    await window.ethereum!.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: chainIdHex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [env.rpcUrl],
          blockExplorerUrls: chain.blockExplorers?.default.url
            ? [chain.blockExplorers.default.url]
            : undefined,
        },
      ],
    });
  }
}
