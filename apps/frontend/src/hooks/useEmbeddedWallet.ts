import type { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';
import { useCallback, useEffect, useState } from 'react';

import type { ApiClient, WalletSession } from '../lib/api.js';
import { createEmbeddedWalletSdk, executeChallenge } from '../lib/embeddedWallet.js';

export type EmbeddedWalletStatus =
  'signed-out' | 'logging-in' | 'creating-wallet' | 'ready' | 'error';

export interface EmbeddedWalletState {
  status: EmbeddedWalletStatus;
  userId: string | undefined;
  walletAddress: string | undefined;
  error: string | undefined;
  login: (email: string) => void;
  logout: () => void;
  submitAttestation: (input: {
    supplier: string;
    proofHash: string;
    policyId: string;
  }) => Promise<{ txHash: string }>;
  sendTransfer: (input: { destinationAddress: string; amount: string }) => Promise<{ txHash: string }>;
}

function storageKey(role: string): string {
  return `provenance-streams:${role}:userId`;
}

/**
 * Manages a Circle User-Controlled ("Embedded") Wallet session for one
 * dashboard role (auditor or supplier — each gets its own identity). `role`
 * only namespaces local persistence; the underlying wallet is per-email.
 *
 * On first login for an email, this sets a PIN and creates the wallet
 * (`CREATE_WALLET` challenge); on later logins it just resumes the existing
 * wallet. The email itself is stored in `localStorage` so a returning user
 * doesn't need to remember anything else — the wallet "persists across
 * sessions" by virtue of always resolving to the same Circle user.
 */
export function useEmbeddedWallet(role: string, api: ApiClient): EmbeddedWalletState {
  const [status, setStatus] = useState<EmbeddedWalletStatus>('signed-out');
  const [session, setSession] = useState<WalletSession | undefined>(undefined);
  const [sdk, setSdk] = useState<W3SSdk | undefined>(undefined);
  const [walletId, setWalletId] = useState<string | undefined>(undefined);
  const [walletAddress, setWalletAddress] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const login = useCallback(
    (email: string) => {
      const userId = email.trim().toLowerCase();
      if (!userId) {
        return;
      }

      setStatus('logging-in');
      setError(undefined);

      void (async () => {
        try {
          const newSession = await api.createWalletSession(userId);
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
          setStatus('ready');
        } catch (loginError) {
          setError(loginError instanceof Error ? loginError.message : 'Failed to sign in.');
          setStatus('error');
        }
      })();
    },
    [api, role],
  );

  useEffect(() => {
    const savedUserId = localStorage.getItem(storageKey(role));
    if (savedUserId) {
      login(savedUserId);
    }
    // Only auto-resume once, on mount.
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(storageKey(role));
    setSession(undefined);
    setSdk(undefined);
    setWalletId(undefined);
    setWalletAddress(undefined);
    setStatus('signed-out');
  }, [role]);

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
    error,
    login,
    logout,
    submitAttestation,
    sendTransfer,
  };
}
