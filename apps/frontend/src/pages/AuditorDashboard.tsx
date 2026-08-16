import { useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';
import styled from 'styled-components';

import type { AttestationFormValues } from '../components/AttestationForm.js';
import { AttestationForm } from '../components/AttestationForm.js';
import { AppShell } from '../components/AppShell.js';
import { EmbeddedWalletLogin } from '../components/EmbeddedWalletLogin.js';
import { StreamCard } from '../components/pipeline/StreamCard.js';
import type { SubmissionStatus } from '../components/TransactionResult.js';
import { TransactionResult } from '../components/TransactionResult.js';
import { WalletChip } from '../components/WalletChip.js';
import type { AppEnv } from '../env.js';
import { useEmbeddedWallet } from '../hooks/useEmbeddedWallet.js';
import { useLiveStream } from '../hooks/useLiveStream.js';
import type { ApiClient, AttestationRecord, PolicySummary } from '../lib/api.js';
import { getPublicClient } from '../lib/clients.js';
import { formatRelativeTime } from '../lib/format.js';
import { buildStreams } from '../lib/streams.js';
import type {
  EvidenceSubmission,
  Payment,
  RiskAnalysis,
  SignatureVerification,
} from '@provenance-streams/protocol';

const LIVE_KINDS = [
  'attestation',
  'payment',
  'risk-analysis',
  'signature-verification',
  'evidence-submission',
] as const;

export function AuditorDashboard({ env, api }: { env: AppEnv; api: ApiClient }) {
  const wallet = useEmbeddedWallet('auditor', api, env);
  const [status, setStatus] = useState<SubmissionStatus>({ state: 'idle' });
  const [balance, setBalance] = useState<string | undefined>(undefined);
  const [attestations, setAttestations] = useState<AttestationRecord[]>([]);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [riskAnalyses, setRiskAnalyses] = useState<RiskAnalysis[]>([]);
  const [signatureVerifications, setSignatureVerifications] = useState<SignatureVerification[]>([]);
  const [pendingEvidence, setPendingEvidence] = useState<EvidenceSubmission[]>([]);
  const [attestingId, setAttestingId] = useState<string | undefined>(undefined);
  const [queueError, setQueueError] = useState<string | undefined>(undefined);

  const refreshPendingEvidence = () => {
    api
      .listEvidenceSubmissions('pending')
      .then(setPendingEvidence)
      .catch(() => undefined);
  };

  function refresh() {
    api
      .listAttestations()
      .then(setAttestations)
      .catch(() => undefined);
    api
      .listPolicies()
      .then(setPolicies)
      .catch(() => undefined);
    api
      .listPayments()
      .then(setPayments)
      .catch(() => undefined);
    api
      .listRiskAnalyses()
      .then(setRiskAnalyses)
      .catch(() => undefined);
    api
      .listSignatureVerifications()
      .then(setSignatureVerifications)
      .catch(() => undefined);
    refreshPendingEvidence();
  }

  useEffect(() => {
    if (wallet.status !== 'ready') {
      return;
    }
    if (wallet.walletAddress) {
      getPublicClient(env)
        .getBalance({ address: wallet.walletAddress as `0x${string}` })
        .then((value) => setBalance(formatEther(value)))
        .catch(() => undefined);
    }
    refresh();
  }, [api, env, wallet.status, wallet.walletAddress, status.state]);

  useLiveStream(
    wallet.status === 'ready' ? `${env.backendUrl}/api/events` : undefined,
    LIVE_KINDS,
    refresh,
  );

  async function handleAttestSubmission(submission: EvidenceSubmission) {
    setQueueError(undefined);
    setAttestingId(submission.id);
    try {
      await wallet.submitAttestation({
        supplier: submission.supplier,
        proofHash: submission.proofHash,
        policyId: submission.policyId,
      });
      refreshPendingEvidence();
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : 'Failed to attest this submission.');
    } finally {
      setAttestingId(undefined);
    }
  }

  async function handleRejectSubmission(submission: EvidenceSubmission) {
    setQueueError(undefined);
    if (!wallet.sessionToken) {
      setQueueError('Sign in with your embedded wallet first.');
      return;
    }
    try {
      await api.rejectEvidenceSubmission(submission.proofHash, wallet.sessionToken);
      refreshPendingEvidence();
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : 'Failed to reject this submission.');
    }
  }

  async function handleSubmit(values: AttestationFormValues) {
    setStatus({ state: 'pending' });
    try {
      await api
        .createEvidenceSubmission({
          supplier: values.supplier,
          policyId: values.policyId.toString(),
          evidenceText: values.evidenceText,
        })
        .catch(() => undefined);

      const { txHash } = await wallet.submitAttestation({
        supplier: values.supplier,
        proofHash: values.proofHash,
        policyId: values.policyId.toString(),
      });
      setStatus({ state: 'success', hash: txHash as `0x${string}` });
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Failed to submit attestation.',
      });
    }
  }

  const myStreams = useMemo(() => {
    if (!wallet.walletAddress) {
      return [];
    }
    const mine = attestations.filter(
      (attestation) => attestation.auditor.toLowerCase() === wallet.walletAddress?.toLowerCase(),
    );
    return buildStreams(mine, policies, payments, riskAnalyses, signatureVerifications);
  }, [
    attestations,
    policies,
    payments,
    riskAnalyses,
    signatureVerifications,
    wallet.walletAddress,
  ]);

  return (
    <AppShell
      title="Auditor"
      subtitle="Submit attestations and track their streams"
      env={env}
      api={api}
      headerActions={
        wallet.status === 'ready' && wallet.walletAddress ? (
          <WalletChip
            address={wallet.walletAddress}
            role="Auditor Wallet"
            balance={balance}
            onSignOut={wallet.logout}
            onSend={wallet.sendTransfer}
          />
        ) : undefined
      }
    >
      {wallet.status !== 'ready' && (
        <Card>
          <SectionTitle>Sign in</SectionTitle>
          <EmbeddedWalletLogin wallet={wallet} />
        </Card>
      )}

      {wallet.status === 'ready' && (
        <Card>
          <SectionTitle>Pending evidence</SectionTitle>
          {queueError && <QueueErrorText>{queueError}</QueueErrorText>}
          {pendingEvidence.length === 0 ? (
            <Empty>No evidence submitted by suppliers yet.</Empty>
          ) : (
            <QueueList>
              {pendingEvidence.map((submission) => (
                <QueueItem key={submission.id}>
                  <QueueItemBody>
                    <span>{submission.evidenceText}</span>
                    <QueueItemMeta>
                      Policy #{submission.policyId} · <Address>{submission.supplier}</Address> ·{' '}
                      {formatRelativeTime(submission.createdAt)}
                    </QueueItemMeta>
                  </QueueItemBody>
                  <QueueActions>
                    <SmallButton
                      onClick={() => {
                        void handleAttestSubmission(submission);
                      }}
                      disabled={attestingId === submission.id}
                    >
                      {attestingId === submission.id ? 'Attesting…' : 'Attest'}
                    </SmallButton>
                    <SmallGhostButton
                      onClick={() => {
                        void handleRejectSubmission(submission);
                      }}
                      disabled={attestingId === submission.id}
                    >
                      Reject
                    </SmallGhostButton>
                  </QueueActions>
                </QueueItem>
              ))}
            </QueueList>
          )}
        </Card>
      )}

      {wallet.status === 'ready' && (
        <Card>
          <SectionTitle>Submit an attestation</SectionTitle>
          <AttestationForm
            submitting={status.state === 'pending'}
            onSubmit={(values) => {
              void handleSubmit(values);
            }}
          />
          <TransactionResult status={status} />
        </Card>
      )}

      {wallet.status === 'ready' && (
        <Section>
          <SectionTitle>Your streams</SectionTitle>
          {myStreams.length === 0 ? (
            <Empty>No attestations submitted yet.</Empty>
          ) : (
            <Grid>
              {myStreams.map((stream) => (
                <StreamCard key={stream.id} stream={stream} />
              ))}
            </Grid>
          )}
        </Section>
      )}
    </AppShell>
  );
}

const Card = styled.div`
  background: ${(props) => props.theme.colors.surface};
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: ${(props) => props.theme.radius.card};
  padding: ${(props) => props.theme.spacing.cardPadding};
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
  color: ${(props) => props.theme.colors.text};
`;

const Empty = styled.p`
  margin: 0;
  color: ${(props) => props.theme.colors.textMuted};
  font-size: 0.9rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
`;

const Address = styled.code`
  color: ${(props) => props.theme.colors.text};
`;

const QueueErrorText = styled.p`
  margin: 0;
  color: ${(props) => props.theme.colors.error};
  font-size: 0.85rem;
`;

const QueueList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
`;

const QueueItem = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid ${(props) => props.theme.colors.border};

  &:last-child {
    border-bottom: none;
  }
`;

const QueueItemBody = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.85rem;
  color: ${(props) => props.theme.colors.text};
  overflow-wrap: anywhere;
`;

const QueueItemMeta = styled.span`
  font-size: 0.75rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const QueueActions = styled.div`
  flex-shrink: 0;
  display: flex;
  gap: 8px;
`;

const SmallButton = styled.button`
  padding: 6px 14px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: none;
  background: ${(props) => props.theme.colors.primary};
  color: ${(props) => props.theme.colors.primaryText};
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 160ms ease-out;

  &:active {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SmallGhostButton = styled.button`
  padding: 6px 14px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: transparent;
  color: ${(props) => props.theme.colors.text};
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 160ms ease-out;

  &:active {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
