import type { Blockchain } from '@circle-fin/user-controlled-wallets';
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
   * Once the frontend reports a challenge as complete, resolves it to a
   * transaction hash: the challenge only carries a transaction id
   * (`correlationIds`), so this looks that up and then polls the transaction
   * itself until a hash is available (or `timeoutMs` elapses).
   */
  async waitForChallengeTxHash(
    userToken: string,
    challengeId: string,
    {
      timeoutMs = 30_000,
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
      const txHash = transaction.data?.transaction?.txHash;
      if (txHash) {
        return txHash;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error('Timed out waiting for the transaction hash.');
  }
}
