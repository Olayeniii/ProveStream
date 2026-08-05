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
import type { ApiClient, AttestationRecord, PolicySummary } from '../lib/api.js';
import { getPublicClient } from '../lib/clients.js';
import { buildStreams } from '../lib/streams.js';
import type { Payment, RiskAnalysis, SignatureVerification } from '@provenance-streams/protocol';

export function AuditorDashboard({ env, api }: { env: AppEnv; api: ApiClient }) {
  const wallet = useEmbeddedWallet('auditor', api);
  const [status, setStatus] = useState<SubmissionStatus>({ state: 'idle' });
  const [balance, setBalance] = useState<string | undefined>(undefined);
  const [attestations, setAttestations] = useState<AttestationRecord[]>([]);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [riskAnalyses, setRiskAnalyses] = useState<RiskAnalysis[]>([]);
  const [signatureVerifications, setSignatureVerifications] = useState<SignatureVerification[]>([]);

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
  }, [api, env, wallet.status, wallet.walletAddress, status.state]);

  async function handleSubmit(values: AttestationFormValues) {
    setStatus({ state: 'pending' });
    try {
      await api
        .submitEvidence({ proofHash: values.proofHash, evidenceText: values.evidenceText })
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
