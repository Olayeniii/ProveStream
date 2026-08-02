/// <reference types="vite/client" />

import type { EIP1193Provider } from 'viem';

declare global {
  interface ImportMetaEnv {
    readonly VITE_RPC_URL: string;
    readonly VITE_CONTRACT_ADDRESS: string;
    readonly VITE_REWARD_POLICY_ADDRESS: string;
    readonly VITE_REWARD_DISPATCHER_ADDRESS: string;
    readonly VITE_CHAIN_ID: string;
    readonly VITE_BACKEND_URL: string;
    readonly VITE_CIRCLE_APP_ID?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    ethereum?: EIP1193Provider;
  }
}
