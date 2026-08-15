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
executing a payout directly. In Milestone 2 it's kept as an off-chain
pre-check before spending gas on `dispatchReward` — the contract's own
`RewardPolicy` lookup remains the authoritative eligibility check, so the two
can never disagree in a way that matters (the pure function just avoids
wasting a transaction on an attestation everyone already knows is
ineligible).

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

`packages/protocol/src/chains.ts` exports `hardhatLocal` and `arcTestnet`,
consumed by the agent, backend, and frontend alike. `agent/src/chainClient.ts`
picks between them by `CHAIN_ID` (falling back to a generic definition for
anything else), so adding Arc mainnet later is a third exported chain, not a
rewrite of any consumer.

## Agent config validated at the boundary, not threaded implicitly

`agent/src/config.ts` uses zod to validate the full config — RPC URL, chain
id, the three contract addresses, the operator's private key, and a
discriminated `treasury: { mode: 'circle' | 'local'; ... }` — once, in one
place, with a clear thrown error on failure. `apps/backend` is the only thing
that reads `process.env`; the agent itself never reaches into environment
variables, so it stays usable from contexts that source config differently
(tests, a future serverless entrypoint).

## Milestone 2

### USDC on Arc is a native-currency transfer, not an ERC-20 call

Arc uses USDC as its native gas token (18 decimals), the same way Ethereum
uses ETH. Circle's Developer Controlled Wallets API reflects this: a
transfer of the native asset uses `tokenAddress: ''` (or simply omits token
fields when addressing the wallet by `walletAddress` + `blockchain`), not an
ERC-20 `transfer()` call. `CircleTreasuryService.sendReward()` and
`LocalTreasuryService.sendReward()` are therefore structurally identical — a
plain value transfer to the supplier's address — which is what makes the
local demo treasury (funded with the chain's native currency) a faithful
stand-in for the real one, not just a fake with a similar name.

### The agent's operator wallet is separate from the treasury

`RewardDispatcher.dispatchReward()` is a normal transaction that needs gas,
but it never moves funds — it only emits `RewardEligible`. Rather than have
the treasury wallet also pay this gas (mixing "funds we're allowed to spend
on suppliers" with "funds that keep the pipeline running"), the agent has
its own `OPERATOR_PRIVATE_KEY` for this one purpose. If the operator key were
ever compromised, the attacker could waste gas re-triggering dispatch calls
(which the contract already guards against via `AlreadyDispatched`) but could
never move a single dollar of treasury USDC.

### `RewardEligible` doesn't carry the attestation id — the agent bridges it

`RewardDispatcher.sol`'s event signature is fixed by spec:
`RewardEligible(rewardId, supplier, policyId, rewardAmount)` — no
`attestationId`. Since the dispatch and the resulting event are one causal
step apart within the same agent process, `index.ts` keeps a small
`Map<rewardId, attestationId>` populated right after a successful dispatch,
and consults it when the `RewardEligible` watcher fires. Rewards dispatched
by another process (or a prior agent run before a restart) simply won't have
an entry — the lineage is best-effort, not something the settlement itself
depends on.

### Embedded wallets and the treasury are validated against the real Circle SDKs, with local fallbacks

`@circle-fin/developer-controlled-wallets` and
`@circle-fin/user-controlled-wallets` are real dependencies, called with
their actual method signatures (verified against the installed packages'
type declarations, not assumed from documentation). Nothing in `agent` or
`apps/backend` is mocked. What's local-only is the _credentials_: without a
Circle sandbox account, `TreasuryService` falls back to a local signer and
`WalletService` is simply `undefined` (the frontend reports embedded wallets
as unavailable rather than failing to start). This means the demo runs fully
offline, and plugging in real Circle credentials later requires zero code
changes — only environment variables.

### Auditor and Supplier get embedded wallets; Admin keeps the injected-wallet flow

The Admin Dashboard's actions (creating/updating reward policies) are
`Ownable`-gated on-chain — they're performed by whichever account deployed
`RewardPolicy`, a trusted operator role, not an arbitrary end user. Reusing
Milestone 1's injected-wallet flow (`lib/clients.ts`) here is simpler and more
appropriate than provisioning an embedded wallet for an admin who already has
a real wallet with the contract owner's key. Auditors and suppliers, who
shouldn't need to manage a seed phrase at all, get the embedded flow.

### "Email login" resolves a wallet by email; it isn't Circle's own OTP-verified flow

Circle's User-Controlled Wallets support a proper OTP-verified email login
(`createDeviceTokenForEmailLogin` + OTP + `verifyOtp`), a bigger flow this
milestone doesn't implement. Instead, the email a user types becomes their
Circle `userId` directly, and a PIN — set once via the real
`CREATE_WALLET`/`SET_PIN` Circle challenge — is what actually secures the
wallet thereafter. This still satisfies "wallet persists across sessions"
(the same email always resolves to the same wallet) and uses Circle's real
wallet infrastructure throughout; it's honest scoping given the added
complexity of the full OTP dance, not a shortcut disguised as the real
thing. Passkey support (explicitly "if available" per spec) is deferred for
the same reason.

## Milestone 3

### Fraud scoring is rule-based and separate from the Gemini risk analysis

`FraudService` scores structured, agent-observed data (submission
frequency, payout frequency, policy-pair reuse, first-time-supplier) — a
different signal from `apps/backend`'s `riskAnalysisService.ts`, which reads
the auditor's free-text evidence via Gemini. They're deliberately not
merged: one needs no external API and can never go "unavailable" (unlike
Gemini, whose failure mode is already handled by falling back to
`unavailable` in the Streams view), and a rule-based check is auditable in a
way an LLM's judgment isn't — useful properties for something that gates a
real payout, not just an informational panel. Duplicate proof hashes are
deliberately _not_ re-checked here: `AttestationRegistry` already rejects
them on-chain (`DuplicateProofHash`), so a real duplicate can never reach
this service's `check()` in the first place — re-scoring it would just be
dead code exercised by an unreachable input.

### The settlement queue doesn't classify errors as recoverable vs. permanent

`SettlementQueue.runWithRetries` retries every failure the same way up to
`maxAttempts`, rather than trying to distinguish "worth retrying" (an RPC
hiccup, a bridge timeout) from "hopeless" (an invalid recipient address) up
front. This is a deliberate simplification: a transient error succeeds on
retry either way, and a permanent one simply exhausts its attempts and lands
in `failed` — the correct terminal state regardless of _why_ it failed.
Building a real error taxonomy would add complexity without changing either
outcome at this scale.

### `AgentControl.approvePayout` reuses the automatic settlement path exactly

When an admin approves a fraud-flagged payout, the backend doesn't
re-implement "send the payment" — `runAgent()`'s returned `AgentControl`
exposes `approvePayout()`, which calls the _same_ internal
`enqueueSettlement()` closure the automatic `RewardEligible` handler uses
(same-chain-or-bridge decision, same retry queue, same `onPaymentSettled`
hook). The only difference is that the fraud check itself is skipped, since
a human already made that call. This guarantees the manual and automatic
paths can never drift apart in behavior — there's only one settlement
implementation, with two entry points.

### The bridge always uses the forwarder destination, never a destination-side adapter

`BridgeService.bridgeToDestination()` calls App Kit's `bridge()` with
`to: { recipientAddress, useForwarder: true }` and no destination adapter,
because the destination is a supplier's own wallet — a keypair this agent
never has access to and shouldn't need. `useForwarder: true` tells Circle's
Orbit relayer to submit the destination-chain mint on the recipient's
behalf once the CCTP attestation is ready, so the agent only ever needs to
sign the source-chain burn.

### New embedded wallets are `SCA`; existing `EOA` wallets are never migrated

Circle Gas Station sponsorship requires a Smart Contract Account wallet.
Retroactively migrating existing `EOA` wallets to `SCA` would mean either a
new address (breaking anything referencing the old one, e.g. registered
destination-wallet lookups keyed by supplier address) or an in-place
account-type change with its own risk. Since this is purely additive —
new logins get gas sponsorship, existing ones just keep paying their own
gas as before — there's no forced-migration tradeoff to make.

### A small JSON snapshot file, not a database, closes the restart gap

`Store`'s read models, `PolicyService`'s known policy ids, and each chain
scan's `scannedThroughBlock` are all disposable data the app re-derives from
chain events, not primary data needing transactions or indexes — so
persisting them is one gitignored JSON file (`snapshotStore.ts`), not a
database. `PolicyService` and `HistoryService` scan incrementally from a
persisted cursor instead of each contract's deployment block, and stop
(returning whatever they found) rather than throwing on a rate-limited
chunk, so both are resumable across restarts instead of needing to finish
in one shot. `rpcRetry.ts`'s `withRpcRetries` also gates every RPC call
behind one shared pacer, not just per-call retry backoff — otherwise
multiple scans retrying independently just re-trip Arc testnet's rate limit
by stacking their bursts.

### `SUPPORTED_DESTINATION_CHAINS` lives in `packages/protocol`, not `agent`

It started in `agent/src/wallet/destinationWallet.ts`, but the frontend's
destination-wallet form needs the same list for its chain dropdown. Rather
than import the whole `agent` package into the browser bundle (which would
pull in Node-only Circle SDK dependencies), the constant moved to
`packages/protocol` — already a dependency of all three apps — and `agent`
re-exports it for backward compatibility with existing imports.

## Post-Milestone-3: Trigger Log, evidence submission, x402 payouts

### x402 payouts settle through Circle Gateway's `BurnIntent`, not plain EIP-3009

The first pass assumed a supplier's x402 claim endpoint could be paid with a
direct, self-facilitated `transferWithAuthorization` (EIP-3009) signed
against Arc's USDC ERC-20 interface — no third party involved. Once Circle
Gateway entered the picture as the intended rail, its real contracts
(cloned from `github.com/circlefin/evm-gateway-contracts` and checked
against Arc testnet live) turned out to sign a much richer `BurnIntent` /
`TransferSpec` struct instead, with `gatewayBurn` restricted to a
Circle-registered operator and `gatewayMint` requiring an attestation only
Circle's own Gateway API can produce — not something a supplier's own
server can self-verify the way a raw ECDSA signature check would be.
`X402Service` therefore does two real network calls per claim: sign the
`BurnIntent` with the treasury key, POST it to
`gateway-api-testnet.circle.com/v1/transfer` for the attestation, then hand
that attestation to the supplier's endpoint as x402 payment proof — the
endpoint calls `gatewayMint` itself and pays its own gas, preserving the
original "supplier self-facilitates settlement" design even though the
underlying mechanism changed. Every contract address, the EIP-712 domain
(`name: "GatewayWallet", version: "1"`, deliberately omitting
`chainId`/`verifyingContract` so one signature is valid across every domain
Gateway supports), and the domain's own type hash were independently
reproduced and checked against a live `domainSeparator()` call on Arc
testnet before being hardcoded — not assumed from documentation or a
third-party summary.

### The Gateway deposit step is a manual script, not part of the agent's runtime

`GatewayWallet` only lets an operator burn from a depositor's _existing_
balance — there's no path from "reward becomes eligible" to "funds exist in
Gateway" without a prior on-chain deposit. Since funding is an occasional
treasury-management action, not something that should happen automatically
on every settlement, `agent/scripts/depositToGateway.ts` is a standalone
script (same category as `scripts/deploy.ts`), not a hook the runtime agent
calls itself.

## Post-Milestone-3: admin auth, ZK threshold verifier, on-chain business rules

### `ADMIN_TOKEN` is one shared secret, not session/JWT machinery

`AdminDashboard` had zero auth — anyone with the URL could approve/reject
fraud-flagged payouts. `requireAdminToken` gates every admin route
(`/api/fraud-alerts`, `/api/agent-health`, `/api/settlement-queue`) behind a
single bearer token, registered via `app.use(path, requireAdminToken)` ahead
of the routes rather than chained as a second handler argument — chaining it
inline broke Express's path-param type inference (`req.params.id` widened to
`string | string[] | undefined`), a real TS+Express quirk, not a style
choice. The long-term fix is identity-backed auth tied to a real wallet
session; this closes the actual exploitable hole by the deadline.

### `RewardPolicy`/`RewardDispatcher` gained on-chain cooldown and reward caps

`Policy` now carries `cooldownSeconds` and `maxRewardsPerSupplier`, set once
at creation (matching `credentialType`'s existing set-once precedent, not
updatable after the fact). `RewardDispatcher.dispatchReward()` enforces both
via `_lastDispatchedAt`/`_dispatchCount` mappings, throwing
`CooldownActive`/`MaxRewardsExceeded` — enforced in the contract itself, not
just the backend, so the guarantee holds regardless of which client submits
the dispatch.

### A Groth16 threshold-check circuit and verifier were added for private claims

`circuits/thresholdCheck.circom` proves `value >= threshold` without
revealing `value` (via circomlib's `GreaterEqThan`), with a real trusted
setup (Powers of Tau) run locally. `ThresholdVerifier.sol` is `snarkjs`'s
auto-generated verifier (renamed from `Groth16Verifier` for consistency with
this project's other contract names; the verifier logic itself is untouched,
byte-identical to what was independently re-verified on-chain for both a
valid and an invalid proof). Deployed standalone — nothing in the existing
attestation/reward flow calls it yet; wiring it into `EvidenceSubmission` as
an optional `zkProof` field is a follow-up, not done this pass.

### Redeploying `RewardPolicy`/`RewardDispatcher` orphans every existing policy — there's no migration step

The cooldown/cap fields above required redeploying `RewardPolicy` and
`RewardDispatcher` (`RewardPolicyRedeployModule`, keeping
`AttestationRegistry` untouched to preserve real attestation history). This
was **not** initially followed by recreating the policies on the new
contract, which silently broke every existing attestation's "Policy Matched"
node (the new contract starts with zero policies) and meant the agent's
`watchContractEvent`-based live listener — which has no historical
backfill, by design (see `rpcRetry.ts`'s note on `HistoryService`, which
_does_ backfill) — never re-evaluated old attestations against the new
dispatcher, so no reward the redeploy predates will ever settle
retroactively. The policies were manually recreated afterward from the old
contract's on-chain state (read directly off the pre-redeploy
`RewardPolicy` address before it was orphaned). Any future contract redeploy
that carries policy data needs an explicit recreation step in the same
change — it is not automatic.

### `attestationReader.ts` needed the same shared RPC pacer as every other service

`getProofHash()` (used by `tryAnalyzeRiskForNewEvidence`'s fallback scan,
which can probe up to 100 attestation ids in a tight loop) was calling
`client.readContract` directly, bypassing `withRpcRetries`'s shared gate —
the one RPC-calling service in the codebase that did. Under Arc testnet's
aggressive rate limiting, an unpaced burst of `getProofHash` calls could
silently starve itself (each rate-limited call swallowed by
`.catch(() => undefined)`, indistinguishable from "attestation doesn't
exist yet"), so it now goes through `withRpcRetries` like every other
service.

### Deployed: Render (backend) + Vercel (frontend), CORS wired explicitly between them

The backend needs a long-running process (live chain watchers via `tsx`),
not a serverless function, so it's a Render Web Service — `npm install` as
the build command (not `npm run build`; `tsx` runs the TypeScript directly
and `agent`/`protocol` export raw `.ts` source, so the `tsc`/`hardhat
compile` build step isn't needed at runtime at all). The frontend is a
static Vite build on Vercel, with its root directory pinned to
`apps/frontend` (a bare `apps` root let Vercel's monorepo auto-detection
grab `apps/backend` instead, alphabetically first). The two are connected by
two env vars that don't default to each other: Vercel's `VITE_BACKEND_URL`
points at the Render URL, and Render's `CORS_ORIGIN` must be set to the
Vercel URL explicitly — the default (`http://localhost:5173`) silently
blocks every request from the deployed frontend with no server-side error,
only a browser-console CORS failure.

### The "Powered by" attribution names Arc, not Circle

The sidebar (`AppShell.tsx`) and landing footer both credit the chain the
app actually runs on (Arc) rather than Circle broadly — Circle is still
named in the product copy itself (it operates Arc, the Gateway/CCTP/Gas
Station rails, and the wallets), but the logo attribution is chain-specific.
The logo is hotlinked from `arc.io`'s own CDN, following the same
established pattern as the prior Circle logo (a remote URL, not a
repo-committed asset).
