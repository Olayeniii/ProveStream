import { attestationRegistryAbi } from '@provenance-streams/protocol';
import type { Address, Hex } from 'viem';

import type { AttestationSubmittedEventArgs } from '@provenance-streams/protocol';

import { createAgentPublicClient } from './chainClient.js';
import type { ChainConfig, StopWatcher } from './chainClient.js';

export interface WatcherConfig extends ChainConfig {
  attestationRegistryAddress: Address;
}

export interface AttestationSubmittedContext {
  /** The transaction that emitted this event — lets a host independently verify the auditor's signature (see `AttestationSubmittedHandler`). */
  transactionHash: Hex;
}

export type AttestationSubmittedHandler = (
  args: AttestationSubmittedEventArgs,
  context: AttestationSubmittedContext,
) => void;

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
        onAttestationSubmitted(log.args, { transactionHash: log.transactionHash });
      }
    },
  });
}
