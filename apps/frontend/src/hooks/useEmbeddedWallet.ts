import type { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppEnv } from '../env.js';
import type { ApiClient, WalletSession } from '../lib/api.js';
import {
  createDeviceIdSdk,
  createEmbeddedWalletSdk,
  executeChallenge,
  verifyEmailOtp,
} from '../lib/embeddedWallet.js';

export type EmbeddedWalletStatus =
  'signed-out' | 'awaiting-otp' | 'logging-in' | 'creating-wallet' | 'ready' | 'error';

export interface EmbeddedWalletState {
  status: EmbeddedWalletStatus;
  userId: string | undefined;
  walletAddress: string | undefined;
  /** ProveStream's own session token (not Circle's `userToken`) — pass to any role-gated API call. */
  sessionToken: string | undefined;
  error: string | undefined;
  /** Starts a fresh sign-in: sends the OTP email, then opens Circle's own hosted code-entry UI. */
  login: (email: string) => void;
  /** Only meaningful while `status === 'awaiting-otp'` — re-sends the OTP email for the in-progress login. */
  resendOtp: () => void;
  logout: () => void;
  submitAttestation: (input: {
    supplier: string;
    proofHash: string;
    policyId: string;
  }) => Promise<{ txHash: string }>;
  sendTransfer: (input: {
    destinationAddress: string;
    amount: string;
  }) => Promise<{ txHash: string }>;
}

function storageKey(role: string): string {
  return `provenance-streams:${role}:userId`;
}

/**
 * The ProveStream session token, persisted separately from `storageKey`'s
 * userId — without this, every reload silently minted a brand-new session
 * (see docs/decisions.md) instead of resuming the one already issued, so
 * logout/revoke could never mean anything (the token being revoked wasn't
 * the one still in use). Reused, not just stored: `login()` passes whatever
 * token is here to `createWalletSession`, and the backend keeps it alive
 * instead of minting a redundant one if it's still valid for this user/role.
 */
function sessionTokenStorageKey(role: string): string {
  return `provenance-streams:${role}:sessionToken`;
}

/**
 * Manages a Circle User-Controlled ("Embedded") Wallet session for one
 * dashboard role (auditor or supplier — each gets its own identity). `role`
 * only namespaces local persistence; the underlying wallet is per-email.
 *
 * A fresh sign-in now goes through real, Circle-OTP-verified email login
 * (`POST /api/auth/email/start` → Circle's own hosted code-entry UI →
 * `POST /api/auth/email/complete`) before ever touching wallet creation —
 * see `WalletService.createEmailLoginDeviceToken`'s docstring for why that's
 * a structurally separate Circle identity path, kept apart from wallet
 * resolution rather than reused as if interchangeable. A *returning* user
 * (valid `sessionToken` already in `localStorage`) skips OTP entirely and
 * resumes straight into the wallet flow — asking for a fresh code on every
 * reload would defeat the whole point of persisting a session.
 */
export function useEmbeddedWallet(
  role: 'auditor' | 'supplier',
  api: ApiClient,
  env: AppEnv,
): EmbeddedWalletState {
  const [status, setStatus] = useState<EmbeddedWalletStatus>('signed-out');
  const [session, setSession] = useState<WalletSession | undefined>(undefined);
  const [sdk, setSdk] = useState<W3SSdk | undefined>(undefined);
  const [walletId, setWalletId] = useState<string | undefined>(undefined);
  const [walletAddress, setWalletAddress] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  // In-progress OTP material, kept only for `resendOtp` — never persisted,
  // it's meaningless once the login either completes or is abandoned.
  const otpMaterialRef = useRef<{ email: string; deviceId: string; otpToken: string } | undefined>(
    undefined,
  );

  /**
   * The shared final step for both a fresh (post-OTP) login and a resumed
   * one: resolve/create the Circle wallet for an already-established
   * ProveStream session, and persist it. `userId`/`sessionToken` are already
   * trusted at this point — the caller is responsible for having verified
   * them (via OTP, or by them already being a valid stored session).
   */
  const establishWallet = useCallback(
    async (userId: string, sessionToken: string) => {
      const newSession = await api.createWalletSession(userId, role, sessionToken);
      setSession(newSession);
      const newSdk = createEmbeddedWalletSdk(newSession);
      setSdk(newSdk);

      const existingWallets = await api.listWallets(userId, newSession.userToken);
      if (existingWallets[0]) {
        setWalletId(existingWallets[0].id);
        setWalletAddress(existingWallets[0].address);
      } else {
        setStatus('creating-wallet');
        const challenge = await api.createWalletChallenge(userId, newSession.userToken);
        await executeChallenge(newSdk, challenge.challengeId);

        const createdWallets = await api.listWallets(userId, newSession.userToken);
        const createdWallet = createdWallets[0];
        if (!createdWallet) {
          throw new Error('Wallet creation completed but no wallet was found.');
        }
        setWalletId(createdWallet.id);
        setWalletAddress(createdWallet.address);
      }

      localStorage.setItem(storageKey(role), userId);
      localStorage.setItem(sessionTokenStorageKey(role), newSession.sessionToken);
      setStatus('ready');
    },
    [api, role],
  );

  const login = useCallback(
    (email: string) => {
      const userId = email.trim().toLowerCase();
      if (!userId || !env.circleAppId) {
        return;
      }

      setStatus('logging-in');
      setError(undefined);

      void (async () => {
        try {
          const deviceId = await createDeviceIdSdk(env.circleAppId!).getDeviceId();
          const material = await api.startEmailLogin(userId, deviceId);
          otpMaterialRef.current = { email: userId, deviceId, ...material };

          setStatus('awaiting-otp');
          // Opens Circle's own hosted code-entry UI — the code the user
          // received by email never reaches this app's own code, only the
          // resulting tokens do, once Circle confirms it was correct.
          const otpResult = await verifyEmailOtp(env.circleAppId!, material);
          otpMaterialRef.current = undefined;

          setStatus('logging-in');
          const { sessionToken } = await api.completeEmailLogin(userId, role, otpResult.userToken);
          await establishWallet(userId, sessionToken);
        } catch (loginError) {
          otpMaterialRef.current = undefined;
          setError(loginError instanceof Error ? loginError.message : 'Failed to sign in.');
          setStatus('error');
        }
      })();
    },
    [api, env.circleAppId, role, establishWallet],
  );

  const resendOtp = useCallback(() => {
    const material = otpMaterialRef.current;
    if (!material) {
      return;
    }
    api.resendEmailLoginOtp(material.email, material.deviceId, material.otpToken).catch(() => {
      setError('Failed to resend the code. Try again in a moment.');
    });
  }, [api]);

  useEffect(() => {
    const savedUserId = localStorage.getItem(storageKey(role));
    const savedSessionToken = localStorage.getItem(sessionTokenStorageKey(role));
    if (!savedUserId || !savedSessionToken) {
      return;
    }
    setStatus('logging-in');
    establishWallet(savedUserId, savedSessionToken).catch(() => {
      // The stored session is no longer valid (expired, revoked, or the
      // narrowed `/api/wallet-sessions` rejected it) — there's no OTP to
      // silently retry with, so fall back to a real signed-out state
      // instead of looping on the same failure every render.
      localStorage.removeItem(storageKey(role));
      localStorage.removeItem(sessionTokenStorageKey(role));
      setStatus('signed-out');
    });
    // Only auto-resume once, on mount.
  }, []);

  const logout = useCallback(() => {
    // Best-effort: logging out locally should never be blocked by the
    // network, but a reachable backend should actually revoke the token
    // rather than leaving it valid until its 24h TTL lapses on its own.
    if (session?.sessionToken) {
      api.logout(session.sessionToken).catch(() => undefined);
    }
    localStorage.removeItem(storageKey(role));
    localStorage.removeItem(sessionTokenStorageKey(role));
    setSession(undefined);
    setSdk(undefined);
    setWalletId(undefined);
    setWalletAddress(undefined);
    setStatus('signed-out');
  }, [api, role, session]);

  const submitAttestation = useCallback(
    async (input: { supplier: string; proofHash: string; policyId: string }) => {
      if (!session || !sdk || !walletId) {
        throw new Error('Sign in with your embedded wallet first.');
      }

      const challenge = await api.createAttestationChallenge(session.userId, {
        userToken: session.userToken,
        walletId,
        ...input,
      });
      await executeChallenge(sdk, challenge.challengeId);

      return api.waitForChallengeTxHash(session.userId, challenge.challengeId, session.userToken);
    },
    [api, session, sdk, walletId],
  );

  const sendTransfer = useCallback(
    async (input: { destinationAddress: string; amount: string }) => {
      if (!session || !sdk || !walletId) {
        throw new Error('Sign in with your embedded wallet first.');
      }

      const challenge = await api.createTransferChallenge(session.userId, {
        userToken: session.userToken,
        walletId,
        ...input,
      });
      await executeChallenge(sdk, challenge.challengeId);

      return api.waitForChallengeTxHash(session.userId, challenge.challengeId, session.userToken);
    },
    [api, session, sdk, walletId],
  );

  return {
    status,
    userId: session?.userId,
    walletAddress,
    sessionToken: session?.sessionToken,
    error,
    login,
    resendOtp,
    logout,
    submitAttestation,
    sendTransfer,
  };
}
