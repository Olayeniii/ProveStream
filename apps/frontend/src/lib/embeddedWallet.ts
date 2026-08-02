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

// The SDK's public entry point doesn't re-export its challenge-result types,
// so these are derived structurally from `execute`'s own callback signature
// rather than reaching into the package's internal module paths.
type ExecuteCallback = NonNullable<Parameters<W3SSdk['execute']>[1]>;
type ChallengeOutcome = NonNullable<Parameters<ExecuteCallback>[1]>;

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
