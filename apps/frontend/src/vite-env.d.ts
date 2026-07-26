/// <reference types="vite/client" />

import type { EIP1193Provider } from 'viem';

declare global {
  interface ImportMetaEnv {
    readonly VITE_RPC_URL: string;
    readonly VITE_CONTRACT_ADDRESS: string;
    readonly VITE_CHAIN_ID: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    ethereum?: EIP1193Provider;
  }
}
