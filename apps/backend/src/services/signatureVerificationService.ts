import type { Address, Hex } from 'viem';
import { createPublicClient, http, recoverTransactionAddress, serializeTransaction } from 'viem';

import { withRpcRetries } from './rpcRetry.js';

export interface SignatureVerificationServiceConfig {
  rpcUrl: string;
}

export interface SignatureVerificationResult {
  signerAddress: Address;
}

/**
 * Independently verifies who actually signed a transaction, rather than
 * trusting the `from` field an RPC node reports. Re-serializes the
 * transaction (as returned by `getTransaction`) with its signature attached
 * and hands that to viem's `recoverTransactionAddress`, which re-derives the
 * exact unsigned payload Ethereum itself hashes and signs, then recovers the
 * signer from `r`/`s`/`v` — verified against real Arc testnet transactions
 * during development, independently matching the RPC's own `from` field.
 *
 * Only EIP-1559 and legacy transactions are handled — the two types this
 * app's own signers (viem wallet clients, Circle embedded wallets) actually
 * produce. Anything else reports an honest "unsupported transaction type"
 * failure rather than guessing.
 */
export class SignatureVerificationService {
  private readonly client;

  constructor(config: SignatureVerificationServiceConfig) {
    this.client = createPublicClient({ transport: http(config.rpcUrl) });
  }

  async verifySignature(transactionHash: Hex): Promise<SignatureVerificationResult> {
    const tx = await withRpcRetries(() => this.client.getTransaction({ hash: transactionHash }));

    if (tx.type === 'eip1559') {
      const serializedTransaction = serializeTransaction(
        {
          chainId: tx.chainId,
          nonce: tx.nonce,
          gas: tx.gas,
          to: tx.to,
          value: tx.value,
          data: tx.input,
          type: 'eip1559',
          maxFeePerGas: tx.maxFeePerGas,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
          accessList: tx.accessList,
        },
        { r: tx.r, s: tx.s, yParity: tx.yParity },
      );
      const signerAddress = await recoverTransactionAddress({ serializedTransaction });
      return { signerAddress };
    }

    if (tx.type === 'legacy') {
      const serializedTransaction = serializeTransaction(
        {
          chainId: tx.chainId ?? undefined,
          nonce: tx.nonce,
          gas: tx.gas,
          to: tx.to,
          value: tx.value,
          data: tx.input,
          type: 'legacy',
          gasPrice: tx.gasPrice,
        },
        { r: tx.r, s: tx.s, v: tx.v },
      );
      const signerAddress = await recoverTransactionAddress({ serializedTransaction });
      return { signerAddress };
    }

    throw new Error(`Unsupported transaction type "${tx.type}" for signature verification.`);
  }
}
