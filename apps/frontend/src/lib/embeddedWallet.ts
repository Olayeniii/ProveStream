import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';

export interface EmbeddedWalletCredentials {
  appId: string;
  userToken: string;
  encryptionKey: string;
}

/** Creates a Circle `W3SSdk` instance authenticated for one user session. */
export function createEmbeddedWalletSdk(credentials: EmbeddedWalletCredentials): W3SSdk {
  return new W3SSdk({
    appSettings: { appId: credentials.appId },
    authentication: {
      userToken: credentials.userToken,
      encryptionKey: credentials.encryptionKey,
    },
  });
}

/**
 * A bare SDK instance, before any login/wallet tokens exist — its only job
 * is `getDeviceId()`, the first real step of the email-OTP flow (see
 * `verifyEmailOtp` below). Kept separate from `createEmbeddedWalletSdk`
 * (which requires a `userToken`/`encryptionKey` that don't exist yet at
 * this point) rather than making those fields optional there.
 */
export function createDeviceIdSdk(appId: string): W3SSdk {
  return new W3SSdk({ appSettings: { appId } });
}

// The SDK's public entry point doesn't re-export its challenge-result/login-
// result types, so these are derived structurally from the constructor's and
// `execute`'s own callback signatures rather than reaching into the
// package's internal module paths.
type ExecuteCallback = NonNullable<Parameters<W3SSdk['execute']>[1]>;
type ChallengeOutcome = NonNullable<Parameters<ExecuteCallback>[1]>;
type LoginCompleteCallback = NonNullable<ConstructorParameters<typeof W3SSdk>[1]>;
type LoginResult = NonNullable<Parameters<LoginCompleteCallback>[1]>;

/**
 * Promise wrapper around Circle's email-OTP flow: configures the SDK with
 * the device-token material from `POST /api/auth/email/start`, then opens
 * Circle's hosted code-entry iframe (`verifyOtp()`). The typed code itself
 * never reaches this app's own code — Circle's iframe collects it directly
 * and the result (or error) arrives via the `onLoginComplete` callback,
 * which this wraps into a single-settle Promise the same way
 * `executeChallenge` wraps `execute()`.
 *
 * Deliberately returns a *separate* SDK instance from the one used for
 * wallet creation/transactions (`createEmbeddedWalletSdk`) — this flow's
 * `userToken`/`encryptionKey` come from a structurally different Circle
 * identity path (see `WalletService.createEmailLoginDeviceToken`'s
 * docstring) and must never be reused as if they were the wallet-flow's own
 * session credentials.
 */
export function verifyEmailOtp(
  appId: string,
  material: { deviceToken: string; deviceEncryptionKey: string; otpToken: string },
): Promise<LoginResult> {
  return new Promise((resolve, reject) => {
    const sdk = new W3SSdk({ appSettings: { appId }, loginConfigs: material }, (error, result) => {
      if (error) {
        reject(new Error(error.message ?? 'Email verification failed.'));
        return;
      }
      if (!result) {
        reject(new Error('Email verification completed with no result.'));
        return;
      }
      resolve(result);
    });
    sdk.verifyOtp();
  });
}

/**
 * Promise wrapper around `W3SSdk.execute`. Resolves once the user completes
 * the challenge in Circle's PIN-entry UI (e.g. setting a PIN and creating a
 * wallet, or approving a transaction), rejects on error or a genuinely
 * terminal failure status.
 *
 * `execute`'s callback can fire more than once as the challenge progresses
 * (e.g. an `IN_PROGRESS`/`PENDING` update before the real `COMPLETE`) — a
 * Promise only settles once, so treating every non-`COMPLETE` status as a
 * hard failure would reject on that first update and silently ignore the
 * real completion that follows. Only `FAILED`/`EXPIRED` are terminal
 * failures; anything else just keeps waiting for a later callback.
 */
export function executeChallenge(sdk: W3SSdk, challengeId: string): Promise<ChallengeOutcome> {
  return new Promise((resolve, reject) => {
    sdk.execute(challengeId, (error, result) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      if (!result) {
        reject(new Error('Challenge completed with no result.'));
        return;
      }

      const status = result.status as string;
      if (status === 'COMPLETE') {
        resolve(result);
        return;
      }
      if (status === 'FAILED' || status === 'EXPIRED') {
        reject(new Error(`Challenge ended with status ${status}.`));
        return;
      }
      // PENDING / IN_PROGRESS: not terminal — wait for a later callback.
    });
  });
}
