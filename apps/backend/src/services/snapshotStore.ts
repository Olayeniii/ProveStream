import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type {
  DestinationWallet,
  FraudAlert,
  Payment,
  SettlementJobRecord,
} from '@provenance-streams/protocol';

import type { AttestationRecord } from '../store.js';

const SNAPSHOT_PATH = path.join(import.meta.dirname, '..', '..', '.store-snapshot.json');

/**
 * The one thing this app actually needs to survive a restart: the `Store`'s
 * read models, plus how far each chain scan (`PolicyService`,
 * `HistoryService`) got, so the next startup's backfill only needs to cover
 * the delta since this snapshot was written instead of re-scanning from each
 * contract's deployment block every time — the thing that was tripping Arc
 * testnet's public RPC rate limit on every restart. A single JSON file, not
 * a real database: everything here is already a plain read model the app
 * derives from chain events, not primary data that needs transactions,
 * indexes, or concurrent-writer safety.
 */
export interface Snapshot {
  attestations: AttestationRecord[];
  payments: Payment[];
  fraudAlerts: FraudAlert[];
  settlementJobs: SettlementJobRecord[];
  destinationWallets: DestinationWallet[];
  knownPolicyIds: string[];
  scannedThroughBlock: {
    attestationRegistry?: string;
    rewardDispatcher?: string;
    rewardPolicy?: string;
  };
}

export function loadSnapshot(): Snapshot | undefined {
  if (!existsSync(SNAPSHOT_PATH)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot;
  } catch (error) {
    console.error('Failed to read snapshot file, starting fresh:', error);
    return undefined;
  }
}

export function saveSnapshot(snapshot: Snapshot): void {
  try {
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
  } catch (error) {
    console.error('Failed to persist snapshot (next restart will re-scan more from chain):', error);
  }
}
