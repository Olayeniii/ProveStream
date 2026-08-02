import { attestationRegistryAbi } from '@provenance-streams/protocol';
import type { Address } from 'viem';

import type { AttestationSubmittedEventArgs } from '@provenance-streams/protocol';

import { createAgentPublicClient } from './chainClient.js';
import type { ChainConfig, StopWatcher } from './chainClient.js';

export interface WatcherConfig extends ChainConfig {
  attestationRegistryAddress: Address;
}

export type AttestationSubmittedHandler = (args: AttestationSubmittedEventArgs) => void;

/**
 * Subscribes to `AttestationSubmitted` events emitted by the deployed
 * `AttestationRegistry` and invokes `onAttestationSubmitted` for each one.
 */
export function watchAttestations(
  config: WatcherConfig,
  onAttestationSubmitted: AttestationSubmittedHandler,
): StopWatcher {
  const client = createAgentPublicClient(config);

  return client.watchContractEvent({
    address: config.attestationRegistryAddress,
    abi: attestationRegistryAbi,
    eventName: 'AttestationSubmitted',
    onLogs: (logs) => {
      for (const log of logs) {
        onAttestationSubmitted(log.args);
      }
    },
  });
}
