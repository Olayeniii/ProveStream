import { isAddress } from 'viem';
import type { Address } from 'viem';

export interface AppEnv {
  rpcUrl: string;
  contractAddress: Address;
  chainId: number;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Reads and validates the Vite-exposed environment variables the app needs. */
export function loadEnv(): AppEnv {
  const contractAddress = required('VITE_CONTRACT_ADDRESS', import.meta.env.VITE_CONTRACT_ADDRESS);
  if (!isAddress(contractAddress)) {
    throw new Error(`VITE_CONTRACT_ADDRESS is not a valid address: ${contractAddress}`);
  }

  return {
    rpcUrl: required('VITE_RPC_URL', import.meta.env.VITE_RPC_URL),
    contractAddress,
    chainId: Number(required('VITE_CHAIN_ID', import.meta.env.VITE_CHAIN_ID)),
  };
}
