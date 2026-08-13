-- One table per Store collection that's already persisted today (see
-- apps/backend/src/store.ts). riskAnalyses/signatureVerifications are
-- deliberately NOT here — they stay in-memory, cheap to rederive on restart,
-- same as before this migration existed.

CREATE TABLE attestations (
  id TEXT PRIMARY KEY,
  supplier TEXT NOT NULL,
  auditor TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  transaction_hash TEXT NOT NULL
);
CREATE INDEX attestations_observed_at_idx ON attestations (observed_at DESC);

CREATE TABLE payments (
  reward_id TEXT PRIMARY KEY,
  attestation_id TEXT NOT NULL,
  supplier TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  reward_amount TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  tx_hash TEXT,
  error TEXT,
  bridged BOOLEAN,
  destination_chain TEXT,
  destination_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE evidence_submissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proof_hash TEXT NOT NULL UNIQUE,
  supplier TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'attested', 'rejected')),
  attestation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE destination_wallets (
  supplier TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  -- Not always 0x-prefixed — Solana destinations use base58.
  address TEXT NOT NULL,
  x402_claim_url TEXT,
  registered_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE fraud_alerts (
  reward_id TEXT PRIMARY KEY,
  attestation_id TEXT NOT NULL,
  supplier TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  reward_amount TEXT NOT NULL,
  score INTEGER NOT NULL,
  reasons JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('flagged', 'approved', 'rejected')),
  -- Whether this alert's resolution has been anchored on DecisionRegistry
  -- (see DecisionAnchorService) — {status: 'pending'|'anchored'|'failed', txHash?}.
  resolution_anchor JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE settlement_jobs (
  reward_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('queued', 'processing', 'retrying', 'settled', 'failed')),
  attempt INTEGER,
  error TEXT,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Replaces the knownPolicyIds/scannedThroughBlock fields previously bolted
-- onto snapshotStore.ts's Snapshot type — PolicyService's known-policy-id
-- set and HistoryService's two backfill cursors each get a row here, keyed
-- by a fixed name (e.g. 'policyService', 'attestationRegistry', 'rewardDispatcher').
CREATE TABLE chain_scan_progress (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
