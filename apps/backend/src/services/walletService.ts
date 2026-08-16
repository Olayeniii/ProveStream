import type { Blockchain, TokenBlockchain } from '@circle-fin/user-controlled-wallets';
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets';

export interface WalletServiceConfig {
  apiKey: string;
  appId: string;
}

export interface UserSession {
  userId: string;
  userToken: string;
  encryptionKey: string;
}

/**
 * Orchestrates Circle's User-Controlled ("Embedded") Wallets on behalf of the
 * frontend. The frontend never talks to Circle directly for anything that
 * needs the API key — it calls this service over HTTP, gets back a
 * `userToken` + `encryptionKey` (and, for wallet creation, a `challengeId`),
 * and hands those to the `W3SSdk` in the browser to complete the flow
 * (PIN entry, wallet creation) without the key material ever leaving Circle's
 * client-side SDK.
 */
export class WalletService {
  private readonly client: ReturnType<typeof initiateUserControlledWalletsClient>;

  constructor(private readonly config: WalletServiceConfig) {
    this.client = initiateUserControlledWalletsClient({ apiKey: config.apiKey });
  }

  get appId(): string {
    return this.config.appId;
  }

  /**
   * Issues a session (userToken + encryptionKey) for `userId`, creating the
   * Circle user first if this is their first session. `userId` is expected to
   * be a stable identifier the frontend generates and persists (e.g. derived
   * from the auditor/supplier's email), so re-login reuses the same wallet.
   */
  async createSession(userId: string): Promise<UserSession> {
    await this.client.createUser({ userId }).catch(() => {
      // Idempotent: Circle rejects creating a userId that already exists,
      // which is the expected case for a returning user.
    });

    const response = await this.client.createUserToken({ userId });
    const userToken = response.data?.userToken;
    const encryptionKey = response.data?.encryptionKey;
    if (!userToken || !encryptionKey) {
      throw new Error('Circle did not return a user token for this session.');
    }

    return { userId, userToken, encryptionKey };
  }

  /**
   * Starts the "set PIN + create wallet" challenge for a first-time user.
   * The returned `challengeId` is executed client-side via `W3SSdk.execute`.
   *
   * New wallets are created as `SCA` (Smart Contract Account), required for
   * Circle Gas Station sponsorship on Arc testnet. Existing `EOA` wallets
   * from before this milestone keep working unchanged — this only affects
   * wallet creation, never an existing session.
   */
  async createWalletChallenge(
    userToken: string,
    blockchain: string,
  ): Promise<{ challengeId: string }> {
    const response = await this.client.createUserPinWithWallets({
      userToken,
      blockchains: [blockchain as Blockchain],
      accountType: 'SCA',
    });

    const challengeId = response.data?.challengeId;
    if (!challengeId) {
      throw new Error('Circle did not return a challenge id for wallet creation.');
    }

    return { challengeId };
  }

  /**
   * Lists the wallets already created for this session, so the frontend can
   * show the resulting address once the wallet-creation challenge completes
   * (or resume it in a later session without repeating the challenge).
   */
  async listWallets(userToken: string): Promise<{ id: string; address: string }[]> {
    const response = await this.client.listWallets({ userToken });
    return (response.data?.wallets ?? []).map((wallet) => ({
      id: wallet.id,
      address: wallet.address,
    }));
  }

  /**
   * Starts a contract-call challenge (e.g. `submitAttestation`) from the
   * user's embedded wallet. Like wallet creation, the returned `challengeId`
   * is executed client-side — the user approves with their PIN, and Circle
   * signs and broadcasts the transaction without the key material ever
   * reaching this server.
   */
  async createContractExecutionChallenge(input: {
    userToken: string;
    walletId: string;
    contractAddress: string;
    abiFunctionSignature: string;
    abiParameters: unknown[];
  }): Promise<{ challengeId: string }> {
    const response = await this.client.createUserTransactionContractExecutionChallenge({
      userToken: input.userToken,
      walletId: input.walletId,
      contractAddress: input.contractAddress,
      abiFunctionSignature: input.abiFunctionSignature,
      abiParameters: input.abiParameters,
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });

    const challengeId = response.data?.challengeId;
    if (!challengeId) {
      throw new Error('Circle did not return a challenge id for this transaction.');
    }

    return { challengeId };
  }

  /**
   * Starts a native-currency transfer challenge from the user's embedded
   * wallet — Arc's native gas token *is* USDC (same reasoning as
   * `CircleTreasuryService.sendReward`), so this is `tokenAddress: ''`
   * (empty = native token, per Circle's own SDK doc comment), not an ERC-20
   * `transfer()` call. Like the other challenges, the returned `challengeId`
   * is executed client-side; Circle signs and broadcasts without the key
   * material ever reaching this server.
   */
  async createTransferChallenge(input: {
    userToken: string;
    walletId: string;
    destinationAddress: string;
    amount: string;
    blockchain: string;
  }): Promise<{ challengeId: string }> {
    const response = await this.client.createTransaction({
      userToken: input.userToken,
      walletId: input.walletId,
      destinationAddress: input.destinationAddress,
      amounts: [input.amount],
      tokenAddress: '',
      blockchain: input.blockchain as TokenBlockchain,
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });

    const challengeId = response.data?.challengeId;
    if (!challengeId) {
      throw new Error('Circle did not return a challenge id for this transfer.');
    }

    return { challengeId };
  }

  /**
   * Starts Circle's real OTP-verified email login (`createDeviceTokenForEmailLogin`)
   * — distinct from `createSession` above, which trusts a typed email
   * unverified. This is a *separate* Circle identity path (its own endpoint
   * takes no app-supplied `userId` at all), used here purely as a proof-of-
   * email-ownership gate: the resulting tokens are verified once via
   * `verifyEmailLoginToken` below, then discarded — they never touch wallet
   * creation, so an existing wallet from `createSession`'s scheme can never
   * be orphaned by this path.
   */
  async createEmailLoginDeviceToken(
    email: string,
    deviceId: string,
  ): Promise<{ deviceToken: string; deviceEncryptionKey: string; otpToken: string }> {
    const response = await this.client.createDeviceTokenForEmailLogin({ deviceId, email });
    const { deviceToken, deviceEncryptionKey, otpToken } = response.data ?? {};
    if (!deviceToken || !deviceEncryptionKey || !otpToken) {
      throw new Error('Circle did not return device-token material for email login.');
    }
    return { deviceToken, deviceEncryptionKey, otpToken };
  }

  /**
   * Re-sends the OTP email for an in-progress login. `userId: email` below
   * is a best-effort choice, not a confirmed one — Circle's SDK types require
   * one of `userId`/`userToken` here (`UserIdOrTokenInput`), but neither
   * exists yet at this pre-verification point in the OTP-only identity path
   * (see the docstring above). Needs confirming against a live Circle
   * sandbox call once email-OTP login is enabled for this app in Circle's
   * console — flagged, not yet exercised end-to-end.
   */
  async resendEmailLoginOtp(input: { email: string; deviceId: string; otpToken: string }) {
    await this.client.resendOTP({
      email: input.email,
      deviceId: input.deviceId,
      otpToken: input.otpToken,
      userId: input.email,
    });
  }

  /**
   * Independently confirms a `userToken` from Circle's `EmailLoginResult` is
   * genuine and currently valid — the backend must not just trust the
   * frontend's claim that `verifyOtp()` succeeded, since anyone could send a
   * fabricated token otherwise. A successful `getUserStatus` call is only
   * possible for a token Circle itself issued after real OTP verification,
   * which is what actually proves ownership here — not any field in the
   * response, which is why this returns nothing on success.
   */
  async verifyEmailLoginToken(otpUserToken: string): Promise<void> {
    await this.client.getUserStatus({ userToken: otpUserToken });
  }

  /**
   * Once the frontend reports a challenge as complete, resolves it to a
   * transaction hash: the challenge only carries a transaction id
   * (`correlationIds`), so this looks that up and then polls the transaction
   * itself until a hash is available (or `timeoutMs` elapses).
   */
  async waitForChallengeTxHash(
    userToken: string,
    challengeId: string,
    {
      // Contract-execution challenges route through Gas Station's paymaster/bundler on
      // top of the SCA wallet's own signing step, which routinely takes longer than a
      // plain native transfer to surface a hash — 30s was cutting those off early.
      timeoutMs = 60_000,
      pollIntervalMs = 1_000,
    }: { timeoutMs?: number; pollIntervalMs?: number } = {},
  ): Promise<string> {
    const challenge = await this.client.getUserChallenge({ challengeId, userToken });
    const transactionId = challenge.data?.challenge?.correlationIds?.[0];
    if (!transactionId) {
      throw new Error('Circle did not return a transaction id for this challenge.');
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const transaction = await this.client.getTransaction({ id: transactionId, userToken });
      const record = transaction.data?.transaction;
      const txHash = record?.txHash;
      if (txHash) {
        return txHash;
      }
      // Circle stops estimating/broadcasting once a transaction lands in one
      // of these terminal states — polling further would just wait out the
      // full timeout for a hash that will never arrive. Surface the real
      // reason (e.g. a contract revert caught during gas estimation) instead
      // of a generic timeout that reads as "still processing."
      if (
        record?.state === 'FAILED' ||
        record?.state === 'DENIED' ||
        record?.state === 'CANCELLED'
      ) {
        const detail = record.errorDetails ?? record.errorReason ?? record.state;
        throw new Error(`Transaction ${record.state.toLowerCase()}: ${detail}`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error('Timed out waiting for the transaction hash.');
  }
}
