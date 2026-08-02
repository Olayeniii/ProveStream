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
