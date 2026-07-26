# Key decisions

## `auditor` is `msg.sender`, not a form field

The frontend form only collects supplier, policy ID, and proof hash — not an
auditor address. `submitAttestation` records `msg.sender` as the auditor, so
the connected wallet _is_ the attestation's authority. This means auth
doesn't need to be reinvented later: whatever wallet solution replaces the
injected-provider flow (Developer Controlled Wallet, Arc App Kit session)
just needs to produce a signer, and the contract's notion of "auditor" keeps
working unchanged.

## Duplicate prevention via a second mapping, not an array scan

`_usedProofHashes[proofHash]` is checked and set in O(1). An alternative —
scanning existing attestations for a matching hash — would grow linearly
with the number of attestations and become gas-prohibitive. The extra
storage slot is the cheaper trade-off long-term.

## Reward decision is a pure value, not a side effect

`evaluateReward()` returns `{ eligible, reason }` instead of logging or
executing a payout directly. Milestone 2's payout logic can consume that
same return value (e.g. `if (decision.eligible) await payout(...)`) without
changing the function's signature or its tests.

## ABI lives in `packages/protocol`, hand-mirrored from the contract

For this milestone the ABI in `packages/protocol/src/abi/attestationRegistry.ts`
is written by hand to match `contracts/AttestationRegistry.sol`, rather than
generated from the compiled artifact. This keeps the frontend and agent
decoupled from Hardhat (the frontend never needs `artifacts/` on its
dependency path). If the contract's interface grows non-trivially, wiring a
small script to regenerate this file from `artifacts/contracts/AttestationRegistry.sol/AttestationRegistry.json`
after `npm run contract:compile` is a contained, non-breaking follow-up.

## Wallet connection is isolated behind `connectWallet()`

`apps/frontend/src/lib/clients.ts` is the only place that touches
`window.ethereum`. The form and result components only ever see a viem
`WalletClient`/`PublicClient`. Introducing a Developer Controlled Wallet or
Arc App Kit means rewriting this one function's internals, not the
component tree.

## Chain config is a single shared definition

`packages/protocol/src/chains.ts` exports `hardhatLocal`, consumed by both
the agent (over HTTP) and the frontend (over the injected provider, with the
chain id overridden from env). Adding Arc testnet/mainnet later is a second
exported chain plus a `CHAIN_ID`-based switch, not a rewrite of either
consumer.

## Agent config validated at the boundary, not threaded implicitly

`agent/src/config.ts` uses zod to validate `{ rpcUrl, contractAddress,
chainId }` once, in one place, with a clear thrown error on failure.
`apps/backend` is the only thing that reads `process.env`; the agent itself
never reaches into environment variables, so it stays usable from contexts
that source config differently (tests, a future serverless entrypoint).
