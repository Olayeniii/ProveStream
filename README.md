# Provenance Streams

Provenance Streams is an autonomous USDC settlement engine built on Arc.

The long-term vision: AI agents monitor on-chain attestations, evaluate reward
policies, and autonomously execute USDC payouts using a Developer Controlled
Wallet, Arc App Kit, and Circle CCTP for cross-chain settlement.

**Milestone 1** proved the core loop — an auditor submits an attestation, the
chain emits an event, and an agent observes it and evaluates a reward rule.

**Milestone 2** made that loop autonomous and real: embedded wallets replace
placeholder wallet handling, a Developer Controlled Wallet treasury sends
real test USDC on Arc, on-chain reward policies decide eligibility, and an
Autonomous Settlement Agent processes the full pipeline end to end.

**Milestone 3** (this one) adds production-grade settlement on top of that
pipeline without rebuilding it: a rule-based fraud check holds suspicious
payouts for admin review instead of auto-dispatching them, a retrying
settlement queue processes payouts one at a time with exponential backoff,
and — when a supplier registers a destination wallet on another chain —
the agent bridges canonical USDC to it cross-chain via **Circle CCTP**
(through **Arc App Kit**'s `bridge()`), instead of paying out same-chain.
New embedded wallets are created as Smart Contract Accounts so **Circle Gas
Station** can sponsor their gas on Arc testnet.

## Architecture

```mermaid
graph TD
    A[Auditor] --> B[Embedded Wallet - SCA / Gas Station]
    B --> C[AttestationRegistry]
    C --> D[RewardDispatcher]
    D --> E[RewardEligible Event]
    E --> F[Fraud Service]
    F -- flagged --> J[Admin Review]
    J -- approved --> K[Settlement Queue]
    F -- clear --> K[Settlement Queue]
    K --> G[Developer Controlled Wallet]
    G -- no destination wallet --> H[Same-chain USDC Transfer]
    G -- destination wallet registered --> L[Bridge Service - Arc App Kit / CCTP]
    L --> M[USDC minted on destination chain]
    H --> I[Supplier Embedded Wallet]
    M --> I
```

### Sequence

```mermaid
sequenceDiagram
    participant Auditor
    participant Frontend
    participant Registry as AttestationRegistry
    participant Dispatcher as RewardDispatcher
    participant Fraud as FraudService
    participant Queue as SettlementQueue
    participant Bridge as BridgeService (App Kit / CCTP)
    participant DCW as Developer Controlled Wallet
    participant Supplier

    Auditor->>Frontend: Sign in with Embedded Wallet (SCA, gasless via Gas Station)
    Frontend->>Registry: submitAttestation(supplier, proofHash, policyId)
    Registry-->>Dispatcher: AttestationSubmitted event
    Dispatcher-->>Fraud: RewardEligible event
    Fraud->>Fraud: score(attestationId, supplier, policyId, rewardAmount)
    alt score >= threshold
        Fraud-->>Frontend: held for admin review (Admin approves/rejects)
    else score below threshold
        Fraud->>Queue: enqueue settlement
        Queue->>Queue: retry with backoff on failure
        alt supplier has a destination wallet
            Queue->>Bridge: bridgeToDestination(amount, recipientAddress)
            Bridge->>Supplier: USDC minted on destination chain (CCTP)
        else
            Queue->>DCW: sendReward(supplier, rewardAmount)
            DCW->>Supplier: same-chain USDC transfer
        end
        Queue-->>Frontend: payment status + tx hash (via backend API)
    end
```

This milestone's fraud checks, retry queue, and bridging are layered onto
Milestone 2's pipeline via `runAgent`'s hooks — none of `watcher.ts`,
`dispatcher.ts`, or the contracts changed.

### Components

| Component                   | Path                                                                     | Responsibility                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attestation registry        | [`contracts/AttestationRegistry.sol`](contracts/AttestationRegistry.sol) | Records attestations, rejects duplicate proof hashes, emits `AttestationSubmitted`.                                                                                                       |
| Reward policy               | [`contracts/RewardPolicy.sol`](contracts/RewardPolicy.sol)               | Owner-configurable reward policies (credential type, reward amount, enabled).                                                                                                             |
| Reward dispatcher           | [`contracts/RewardDispatcher.sol`](contracts/RewardDispatcher.sol)       | Validates eligibility against a policy, prevents duplicate rewards, emits `RewardEligible`. Holds no funds.                                                                               |
| Shared protocol             | [`packages/protocol`](packages/protocol)                                 | Contract ABIs, decoded event/struct types, and chain config (local Hardhat + Arc testnet) shared everywhere.                                                                              |
| Autonomous Settlement Agent | [`agent`](agent)                                                         | Watches `AttestationSubmitted` → dispatches rewards on-chain → watches `RewardEligible` → fraud-checks, queues, and settles payments (same-chain or cross-chain bridge) via the treasury. |
| Backend API                 | [`apps/backend`](apps/backend)                                           | Runs the agent, exposes dashboard read/admin APIs, and brokers Circle embedded-wallet sessions for the frontend.                                                                          |
| Frontend                    | [`apps/frontend`](apps/frontend)                                         | Auditor, Supplier, Policies, Treasury, Analytics, and Admin dashboards; embedded-wallet login; attestation submission.                                                                    |

See [`docs/architecture.md`](docs/architecture.md) for a closer look at each
module's internals, and [`docs/decisions.md`](docs/decisions.md) for the
reasoning behind key choices and how they set up Milestone 3.

## Wallet architecture

Two distinct wallet models are in play, matching Circle's product split:

- **Embedded (User-Controlled) Wallets** — used by the **Auditor** and
  **Supplier** dashboards. The frontend never touches a Circle API key: it
  calls `apps/backend`'s `/api/wallet-sessions/*` routes, which broker a
  `userToken` + `encryptionKey` from Circle, and the browser's
  `@circle-fin/w3s-pw-web-sdk` handles the rest (PIN entry, wallet creation,
  transaction approval) without any key material reaching this server. A
  user's wallet is keyed by their email, so it persists across sessions.
- **Developer Controlled Wallet (treasury)** — held entirely server-side by
  the agent's `TreasuryService`, funded to pay suppliers. Never exposed to
  the frontend.

Both are implemented against a common interface so a later swap (e.g. Arc App
Kit) touches one file, not the call sites. See
[`docs/decisions.md`](docs/decisions.md) for the specifics.

## Treasury architecture

`agent/src/treasuryService.ts` defines a `TreasuryService` interface
(`getBalance`, `sendReward`) with two implementations, selected by which
environment variables are set:

- **`CircleTreasuryService`** — real Circle Developer Controlled Wallet via
  `@circle-fin/developer-controlled-wallets`. Since Arc's native gas token
  _is_ USDC, sending USDC is a native-currency transfer, not an ERC-20 call.
  Used when `CIRCLE_API_KEY` / `CIRCLE_ENTITY_SECRET` / `CIRCLE_TREASURY_WALLET_ID`
  are set.
- **`LocalTreasuryService`** — a local viem-signed account that sends the
  configured chain's native currency directly. This is the local demo
  treasury (see [Local setup](#local-setup)) — structurally the same
  operation as the Circle path, just signed locally instead of by Circle's
  infrastructure. Used otherwise, via `TREASURY_PRIVATE_KEY`.

The agent's own operator wallet (`OPERATOR_PRIVATE_KEY`) is separate from
both: it only pays gas to call `RewardDispatcher.dispatchReward`, and never
holds treasury funds.

## Fraud review, settlement queue, and cross-chain settlement

Before a `RewardEligible` payout is settled, `agent/src/services/fraudService.ts`
scores it against in-memory rolling history (repeated submissions, payout
frequency, policy-pair reuse, first-time-supplier heuristic) — duplicate
proof hashes are already rejected on-chain, so they're not re-checked here.
Payouts scoring at or above `FRAUD_SCORE_THRESHOLD` (default `70`) are held
and surfaced on the Admin dashboard's **Fraud Alerts** section instead of
being auto-dispatched; approving one there re-enqueues it for settlement,
rejecting one leaves it permanently unsettled.

Payouts that clear the fraud check go onto `agent/src/services/settlementQueue.ts`,
a single-worker in-memory queue (settlement transactions share the
treasury's nonce, so processing one at a time avoids races) that retries
recoverable failures with exponential backoff before giving up. Its live
state is the Admin dashboard's **Settlement Queue** section.

If the supplier registered a destination wallet on another chain (Supplier
dashboard → **Destination Wallet**), the queue routes the payout through
`agent/src/services/bridgeService.ts` instead of a same-chain transfer: it
calls `@circle-fin/app-kit`'s `bridge()`, which "abstracts the underlying
CCTP flow" — burn, attestation, and mint — so the agent doesn't orchestrate
those steps itself. The destination is a wallet this agent doesn't control,
so the bridge uses App Kit's forwarder-only destination (`useForwarder:
true`): Circle's Orbit relayer submits the mint on the supplier's behalf.
Suppliers without a registered destination wallet keep getting paid
same-chain on Arc, unchanged from Milestone 2. Currently supported
destination: Ethereum Sepolia.

## Gas Station (Arc's Paymaster)

Arc's account-abstraction "Paymaster" story is Circle **Gas Station**, which
has a preconfigured sponsorship policy on Arc testnet (no console setup
needed). Sponsorship requires a **Smart Contract Account (SCA)** wallet, not
an `EOA`. `apps/backend/src/services/walletService.ts`'s
`createWalletChallenge` creates all **new** embedded wallets as `SCA`;
existing `EOA` wallets from before this milestone keep working unchanged —
this is a forward-only change, never a forced re-migration.

## Current progress (Milestone 3)

- [x] `RewardPolicy.sol` — `createPolicy` / `updatePolicy` / `disablePolicy` /
      `getPolicy`, owner-controlled (OpenZeppelin `Ownable`), policies
      configurable without redeploying.
- [x] `RewardDispatcher.sol` — validates eligibility against a policy,
      prevents duplicate rewards per attestation, emits `RewardEligible`.
      Holds no funds.
- [x] Autonomous Settlement Agent — `dispatcher.ts` (on-chain dispatch +
      `RewardEligible` watcher) and `treasuryService.ts` (Circle DCW / local
      signer), composed with the Milestone 1 `watcher.ts` / `rewardEngine.ts`
      in `index.ts`.
- [x] `apps/backend` is now an HTTP API: dashboard read endpoints
      (`/api/treasury`, `/api/policies`, `/api/attestations`, `/api/payments`)
      and embedded-wallet session/challenge brokering
      (`/api/wallet-sessions/*`).
- [x] Embedded wallet login (email-based, Circle User-Controlled Wallets) for
      the Auditor and Supplier dashboards; all their blockchain interactions
      (attestation submission included) go through the embedded wallet.
- [x] Auditor Dashboard — sign in, submit an attestation, view your
      submissions.
- [x] Supplier Dashboard — sign in, wallet address, USDC balance, reward
      history with payment status.
- [x] Admin Dashboard — treasury balance, create/view reward policies (via an
      owner-connected browser wallet), recent attestations, recent payments.
- [x] End-to-end verified locally in the demo (local embedded-wallet + local
      treasury) configuration: submitting an attestation triggers
      `dispatchReward`, which emits `RewardEligible`, which the agent
      settles — and the resulting transaction hash shows up in the Supplier
      and Admin dashboards.
- [x] `FraudService` — rule-based risk scoring; payouts at or above
      `FRAUD_SCORE_THRESHOLD` are held for admin review instead of
      auto-dispatched.
- [x] `SettlementQueue` — single-worker retrying queue with exponential
      backoff, structured lifecycle events (`queued`/`processing`/
      `retrying`/`settled`/`failed`).
- [x] `BridgeService` — cross-chain settlement to a supplier's own wallet on
      Ethereum Sepolia via Arc App Kit's CCTP `bridge()`, used automatically
      once a supplier registers a destination wallet; same-chain payout
      remains the default otherwise.
- [x] Embedded wallets switch to `SCA` for new wallets, enabling Circle Gas
      Station sponsorship on Arc testnet.
- [x] `apps/backend` gains `/api/destination-wallet`, `/api/fraud-alerts`
      (+ approve/reject), `/api/settlement-queue`, and `/api/agent-health`.
- [x] Supplier dashboard: register a destination wallet; reward history
      shows bridge status when a payout settled cross-chain.
- [x] Admin dashboard: Settlement Queue, Fraud Alerts (approve/reject),
      Recent Bridge Operations, Agent Health sections.
- [x] Analytics: successful/failed settlement counts, active
      suppliers/auditors, alongside the existing average-settlement-time
      metric.
- [x] Unit tests for `FraudService`'s scoring and `SettlementQueue`'s
      retry/backoff state machine (`agent/src/services/*.test.ts`).

Not implemented (documented scope limits, not gaps): automated integration
tests against live Arc testnet/Circle sandbox (impractical without live
credentials in CI — manual end-to-end verification instead, see below), and
account-abstraction providers beyond Circle Gas Station.

## Roadmap beyond hackathon

- **More destination chains** — `SUPPORTED_DESTINATION_CHAINS`
  (`packages/protocol/src/destinationChains.ts`) is a single-array extension
  point; each addition needs the matching `BridgeChain` value from Arc App
  Kit.
- **Persistent storage** — swap `apps/backend/src/store.ts`'s in-memory maps
  for a real database; every read/write already goes through this one file.
- **Advanced treasury policies** — daily spending limits, allowed-contract
  lists, multi-approver controls.
- **Real OTP-verified embedded-wallet login and passkey support** — see
  [`docs/decisions.md`](docs/decisions.md) for why this milestone's
  email-as-userId login is an intentional, honest scope cut, not a shortcut.

## Repository structure

```
provenance-streams/
├── apps/
│   ├── frontend/       # React + Vite: Auditor / Supplier / Admin dashboards
│   └── backend/        # Express API: agent runner, dashboards, wallet sessions
├── packages/
│   └── protocol/       # Shared ABIs, types, chain config
├── agent/              # watcher / dispatcher / rewardEngine / logger / services (treasury, fraud, bridge, settlement queue) / wallet
├── contracts/          # AttestationRegistry, RewardPolicy, RewardDispatcher
├── ignition/           # Deployment module
├── scripts/            # `hardhat run` scripts
├── test/               # Contract tests
├── docs/               # Architecture & decision notes
└── README.md
```

## Local setup

This runs the full pipeline locally without needing a real Circle account:
the treasury is a local signer, and the embedded wallet uses Circle's actual
User-Controlled Wallets infrastructure — you'll just need free Circle
sandbox credentials for that one piece (or you can leave it unconfigured and
the frontend will tell you embedded wallets are disabled).

### Prerequisites

- Node.js `>= 22.12.0` and npm `>= 10`
- A [Circle Developer Console](https://console.circle.com) account for
  embedded wallets (App ID + API key) — free, sandbox-only. Optional: without
  it, everything else in this milestone still runs, minus wallet login.
- A browser wallet extension (e.g. [MetaMask](https://metamask.io)) for the
  Admin Dashboard's policy management

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

The defaults already target a local Hardhat node and use Hardhat's
well-known local test accounts as the agent's operator wallet and local demo
treasury — never reuse these keys outside a local demo. You'll fill in the
contract addresses after deploying in step 4.

To enable embedded wallets, add your Circle sandbox `CIRCLE_API_KEY` and
`CIRCLE_APP_ID` (and set the matching `VITE_CIRCLE_APP_ID`). Leave
`CIRCLE_ENTITY_SECRET` / `CIRCLE_TREASURY_WALLET_ID` unset to keep using the
local demo treasury.

`FRAUD_SCORE_THRESHOLD` (optional, default `70`) tunes when a payout gets
held for admin review instead of auto-dispatched — see [Fraud review,
settlement queue, and cross-chain settlement](#fraud-review-settlement-queue-and-cross-chain-settlement)
above.

### 3. Start a local chain

```bash
npm run contract:node
```

Leave this running.

### 4. Deploy the contracts

In a new terminal:

```bash
npm run contract:deploy
```

This deploys `AttestationRegistry`, `RewardPolicy`, and `RewardDispatcher`,
and prints the values to copy into `.env` (`CONTRACT_ADDRESS`,
`REWARD_POLICY_ADDRESS`, `REWARD_DISPATCHER_ADDRESS`, and their `VITE_`
counterparts).

### 5. Start the backend

```bash
npm run dev -w @provenance-streams/backend
```

This starts the Autonomous Settlement Agent and the HTTP API
(`http://localhost:4000` by default).

### 6. Start the frontend

```bash
npm run dev -w @provenance-streams/frontend
```

Open the printed URL and try the flow:

1. **Admin** (`/admin`) — connect a browser wallet (any funded Hardhat test
   account) and create a reward policy, e.g. credential type
   `ISO-9001-AUDIT`, reward amount `1.5`.
2. **Auditor** (`/auditor`) — sign in with an email (creates an embedded
   wallet on first login), submit an attestation with any supplier address
   and the policy id you just created.
3. Watch the backend terminal: it logs the attestation, dispatches the
   reward on-chain, observes `RewardEligible`, and sends the payment.
4. **Supplier** (`/supplier`) — sign in with an embedded wallet using the
   supplier address's associated email (or check the Admin Dashboard's
   recent payments), see the balance update and the payment's transaction
   hash.

### Deployment guide (Arc testnet)

To run against real Arc instead of the local demo:

1. Set `RPC_URL=https://rpc.testnet.arc.io`, `CHAIN_ID=5042002`,
   `VITE_RPC_URL`/`VITE_CHAIN_ID` to match.
2. Fund an operator account from the [Arc testnet faucet](https://faucet.circle.com)
   and set `OPERATOR_PRIVATE_KEY`.
3. In the [Circle Developer Console](https://console.circle.com), create a
   Developer-Controlled wallet set and a wallet on `ARC-TESTNET`, fund it via
   the faucet, and set `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`,
   `CIRCLE_TREASURY_WALLET_ID` (leave `CIRCLE_TREASURY_BLOCKCHAIN=ARC-TESTNET`).
4. Set `CIRCLE_APP_ID` / `VITE_CIRCLE_APP_ID` for embedded wallets.
5. Deploy contracts with `npm run contract:deploy -- --network arcTestnet`
   after adding an `arcTestnet` network to `hardhat.config.ts`.

## Development scripts

Run from the repo root:

| Command                    | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `npm run contract:compile` | Compile contracts                                    |
| `npm run contract:node`    | Start a local Hardhat chain                          |
| `npm run contract:deploy`  | Deploy the protocol contracts to `localhost`         |
| `npm run build`            | Build contracts and all workspaces                   |
| `npm test`                 | Run contract tests and all workspace test suites     |
| `npm run lint`             | Lint the whole monorepo                              |
| `npm run format`           | Format the whole monorepo                            |
| `npm run typecheck`        | Typecheck contracts scripts/tests and all workspaces |
| `npm run check`            | Format check + lint + typecheck + tests              |

## License

MIT — see [LICENSE](LICENSE).
