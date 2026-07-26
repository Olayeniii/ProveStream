import { attestationRegistryAbi, hardhatLocal } from '@provenance-streams/protocol';
import type { Address } from 'viem';
import { createPublicClient, http } from 'viem';

import type { AttestationSubmittedEventArgs } from '@provenance-streams/protocol';

export interface WatcherConfig {
  rpcUrl: string;
  contractAddress: Address;
  chainId: number;
}

export type AttestationSubmittedHandler = (args: AttestationSubmittedEventArgs) => void;

/** Stops the underlying event subscription. */
export type StopWatcher = () => void;

/**
 * Subscribes to `AttestationSubmitted` events emitted by the deployed
 * `AttestationRegistry` and invokes `onAttestationSubmitted` for each one.
 */
export function watchAttestations(
  config: WatcherConfig,
  onAttestationSubmitted: AttestationSubmittedHandler,
): StopWatcher {
  const client = createPublicClient({
    chain: { ...hardhatLocal, id: config.chainId },
    transport: http(config.rpcUrl),
  });

  return client.watchContractEvent({
    address: config.contractAddress,
    abi: attestationRegistryAbi,
    eventName: 'AttestationSubmitted',
    onLogs: (logs) => {
      for (const log of logs) {
        onAttestationSubmitted(log.args);
      }
    },
  });
}
