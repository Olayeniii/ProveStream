import { isAddress } from 'viem';
import type { Address } from 'viem';

export interface AppEnv {
  rpcUrl: string;
  contractAddress: Address;
  rewardPolicyAddress: Address;
  rewardDispatcherAddress: Address;
  chainId: number;
  backendUrl: string;
  circleAppId: string | undefined;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requiredAddress(name: string, value: string | undefined): Address {
  const raw = required(name, value);
  if (!isAddress(raw)) {
    throw new Error(`${name} is not a valid address: ${raw}`);
  }
  return raw;
}

/** Reads and validates the Vite-exposed environment variables the app needs. */
export function loadEnv(): AppEnv {
  return {
    rpcUrl: required('VITE_RPC_URL', import.meta.env.VITE_RPC_URL),
    contractAddress: requiredAddress(
      'VITE_CONTRACT_ADDRESS',
      import.meta.env.VITE_CONTRACT_ADDRESS,
    ),
    rewardPolicyAddress: requiredAddress(
      'VITE_REWARD_POLICY_ADDRESS',
      import.meta.env.VITE_REWARD_POLICY_ADDRESS,
    ),
    rewardDispatcherAddress: requiredAddress(
      'VITE_REWARD_DISPATCHER_ADDRESS',
      import.meta.env.VITE_REWARD_DISPATCHER_ADDRESS,
    ),
    chainId: Number(required('VITE_CHAIN_ID', import.meta.env.VITE_CHAIN_ID)),
    backendUrl: required('VITE_BACKEND_URL', import.meta.env.VITE_BACKEND_URL),
    circleAppId: import.meta.env.VITE_CIRCLE_APP_ID || undefined,
  };
}
