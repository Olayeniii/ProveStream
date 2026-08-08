import type {
  DestinationWallet,
  EvidenceSubmission,
  Payment,
  RiskAnalysis,
  SignatureVerification,
} from '@provenance-streams/protocol';
import { SUPPORTED_DESTINATION_CHAINS } from '@provenance-streams/protocol';
import { useEffect, useMemo, useState } from 'react';
import { formatEther, isAddress } from 'viem';
import styled from 'styled-components';

import { AppShell } from '../components/AppShell.js';
import { EmbeddedWalletLogin } from '../components/EmbeddedWalletLogin.js';
import { StreamCard } from '../components/pipeline/StreamCard.js';
import { Skeleton } from '../components/Skeleton.js';
import { WalletChip } from '../components/WalletChip.js';
import type { AppEnv } from '../env.js';
import { useEmbeddedWallet } from '../hooks/useEmbeddedWallet.js';
import type { ApiClient, AttestationRecord, PolicySummary } from '../lib/api.js';
import { getPublicClient } from '../lib/clients.js';
import { formatRelativeTime } from '../lib/format.js';
import { buildStreams } from '../lib/streams.js';
import type { StreamTone } from '../lib/streams.js';
import { getToneColor } from '../lib/tone.js';

const EVIDENCE_STATUS_TONE: Record<EvidenceSubmission['status'], StreamTone> = {
  pending: 'warning',
  attested: 'positive',
  rejected: 'negative',
};

export function SupplierDashboard({ env, api }: { env: AppEnv; api: ApiClient }) {
  const wallet = useEmbeddedWallet('supplier', api);
  const [balance, setBalance] = useState<string | undefined>(undefined);
  const [attestations, setAttestations] = useState<AttestationRecord[]>([]);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [riskAnalyses, setRiskAnalyses] = useState<RiskAnalysis[]>([]);
  const [signatureVerifications, setSignatureVerifications] = useState<SignatureVerification[]>([]);
  const [destinationWallet, setDestinationWallet] = useState<DestinationWallet | undefined>(
    undefined,
  );
  const [evidenceSubmissions, setEvidenceSubmissions] = useState<EvidenceSubmission[]>([]);

  const refreshEvidenceSubmissions = () => {
    api
      .listEvidenceSubmissions()
      .then(setEvidenceSubmissions)
      .catch(() => undefined);
  };

  useEffect(() => {
    if (wallet.status !== 'ready' || !wallet.walletAddress) {
      return;
    }

    const publicClient = getPublicClient(env);
    publicClient
      .getBalance({ address: wallet.walletAddress as `0x${string}` })
      .then((value) => setBalance(formatEther(value)))
      .catch(() => undefined);

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
    api
      .getDestinationWallet(wallet.walletAddress)
      .then(setDestinationWallet)
      .catch(() => undefined);
    refreshEvidenceSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, env, wallet.status, wallet.walletAddress]);

  const mySubmissions = useMemo(
    () =>
      wallet.walletAddress
        ? evidenceSubmissions.filter(
            (submission) => submission.supplier.toLowerCase() === wallet.walletAddress?.toLowerCase(),
          )
        : [],
    [evidenceSubmissions, wallet.walletAddress],
  );

  const [evidencePolicyId, setEvidencePolicyId] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [evidenceError, setEvidenceError] = useState<string | undefined>(undefined);
  const [submittingEvidence, setSubmittingEvidence] = useState(false);

  const handleSubmitEvidence = () => {
    if (!wallet.walletAddress) {
      return;
    }
    const policyIdNumber = Number(evidencePolicyId);
    if (!evidencePolicyId.trim() || !Number.isInteger(policyIdNumber) || policyIdNumber < 0) {
      setEvidenceError('Enter a non-negative whole number for the policy ID.');
      return;
    }
    if (!evidenceText.trim()) {
      setEvidenceError('Enter the evidence text for an auditor to review.');
      return;
    }
    setEvidenceError(undefined);
    setSubmittingEvidence(true);
    api
      .createEvidenceSubmission({
        supplier: wallet.walletAddress,
        policyId: evidencePolicyId,
        evidenceText,
      })
      .then(() => {
        setEvidenceText('');
        setEvidencePolicyId('');
        refreshEvidenceSubmissions();
      })
      .catch((error: unknown) =>
        setEvidenceError(error instanceof Error ? error.message : 'Failed to submit evidence.'),
      )
      .finally(() => setSubmittingEvidence(false));
  };

  const [destinationChain, setDestinationChain] = useState<string>(SUPPORTED_DESTINATION_CHAINS[0]);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationError, setDestinationError] = useState<string | undefined>(undefined);
  const [savingDestination, setSavingDestination] = useState(false);
  const [editingDestination, setEditingDestination] = useState(false);

  const handleEditDestination = () => {
    if (destinationWallet) {
      setDestinationChain(destinationWallet.chain);
      setDestinationAddress(destinationWallet.address);
    }
    setDestinationError(undefined);
    setEditingDestination(true);
  };

  const handleRegisterDestination = () => {
    if (!wallet.walletAddress) {
      return;
    }
    if (!isAddress(destinationAddress)) {
      setDestinationError('Enter a valid EVM address.');
      return;
    }
    setDestinationError(undefined);
    setSavingDestination(true);
    api
      .registerDestinationWallet({
        supplier: wallet.walletAddress,
        chain: destinationChain,
        address: destinationAddress,
      })
      .then((record) => {
        setDestinationWallet(record);
        setEditingDestination(false);
      })
      .catch((error: unknown) =>
        setDestinationError(error instanceof Error ? error.message : 'Failed to register wallet.'),
      )
      .finally(() => setSavingDestination(false));
  };

  const myStreams = useMemo(() => {
    if (!wallet.walletAddress) {
      return [];
    }
    const mine = attestations.filter(
      (attestation) => attestation.supplier.toLowerCase() === wallet.walletAddress?.toLowerCase(),
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
      title="Supplier"
      subtitle="Wallet, rewards, and completed streams"
      env={env}
      api={api}
      headerActions={
        wallet.status === 'ready' && wallet.walletAddress ? (
          <WalletChip
            address={wallet.walletAddress}
            role="Supplier Wallet"
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
          <SectionTitle>Wallet</SectionTitle>
          <StatRow>
            <Stat>
              <StatLabel>Reward Account</StatLabel>
              <StatValue as="code">{wallet.walletAddress}</StatValue>
            </Stat>
            <Stat>
              <StatLabel>USDC balance</StatLabel>
              <StatValue>{balance ?? <Skeleton $width="100px" />}</StatValue>
            </Stat>
          </StatRow>
        </Card>
      )}

      {wallet.status === 'ready' && (
        <Card>
          <SectionTitle>Destination wallet</SectionTitle>
          <HelperText>
            Register a wallet on another chain to receive rewards there instead of on Arc — the
            agent bridges canonical USDC to it via Circle CCTP.
          </HelperText>
          {destinationWallet && !editingDestination ? (
            <StatRow>
              <Stat>
                <StatLabel>Chain</StatLabel>
                <StatValue>{destinationWallet.chain.replace('_', ' ')}</StatValue>
              </Stat>
              <Stat>
                <StatLabel>Address</StatLabel>
                <StatValue as="code">{destinationWallet.address}</StatValue>
              </Stat>
              <EditButton onClick={handleEditDestination}>Edit</EditButton>
            </StatRow>
          ) : (
            <FormRow>
              <Select
                value={destinationChain}
                onChange={(event) => setDestinationChain(event.target.value)}
              >
                {SUPPORTED_DESTINATION_CHAINS.map((chain) => (
                  <option key={chain} value={chain}>
                    {chain.replace('_', ' ')}
                  </option>
                ))}
              </Select>
              <Input
                placeholder="0x…"
                value={destinationAddress}
                onChange={(event) => setDestinationAddress(event.target.value)}
              />
              <Button onClick={handleRegisterDestination} disabled={savingDestination}>
                {savingDestination ? 'Saving…' : destinationWallet ? 'Save' : 'Register'}
              </Button>
              {destinationWallet && (
                <EditButton
                  type="button"
                  onClick={() => {
                    setEditingDestination(false);
                    setDestinationError(undefined);
                  }}
                  disabled={savingDestination}
                >
                  Cancel
                </EditButton>
              )}
            </FormRow>
          )}
          {destinationError && <ErrorText>{destinationError}</ErrorText>}
        </Card>
      )}

      {wallet.status === 'ready' && (
        <Card>
          <SectionTitle>Submit evidence</SectionTitle>
          <HelperText>
            Send evidence to an auditor ahead of time — it lands in their queue with a real proof
            hash already computed, so they attest to what you actually submitted instead of typing
            it in from scratch.
          </HelperText>
          <FormRow>
            <Input
              placeholder="Policy ID"
              value={evidencePolicyId}
              onChange={(event) => setEvidencePolicyId(event.target.value)}
              style={{ flex: '0 0 140px', minWidth: '100px' }}
            />
            <Input
              placeholder="Evidence text for the auditor to review"
              value={evidenceText}
              onChange={(event) => setEvidenceText(event.target.value)}
            />
            <Button onClick={handleSubmitEvidence} disabled={submittingEvidence}>
              {submittingEvidence ? 'Submitting…' : 'Submit'}
            </Button>
          </FormRow>
          {evidenceError && <ErrorText>{evidenceError}</ErrorText>}
          {mySubmissions.length > 0 && (
            <List>
              {mySubmissions.map((submission) => (
                <ListItem key={submission.id}>
                  <ListItemBody>
                    <span>{submission.evidenceText}</span>
                    <ListItemMeta>
                      Policy #{submission.policyId} · {formatRelativeTime(submission.createdAt)}
                    </ListItemMeta>
                  </ListItemBody>
                  <StatusPill $tone={EVIDENCE_STATUS_TONE[submission.status]}>
                    {submission.status}
                  </StatusPill>
                </ListItem>
              ))}
            </List>
          )}
        </Card>
      )}

      {wallet.status === 'ready' && (
        <Section>
          <SectionTitle>Reward history</SectionTitle>
          {myStreams.length === 0 ? (
            <Empty>No rewards yet. They&apos;ll appear here once an attestation is approved.</Empty>
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

const StatRow = styled.div`
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
`;

const Stat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StatLabel = styled.span`
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${(props) => props.theme.colors.textMuted};
`;

const StatValue = styled.span`
  font-size: 1rem;
  word-break: break-all;
  color: ${(props) => props.theme.colors.text};
`;

const Empty = styled.p`
  margin: 0;
  color: ${(props) => props.theme.colors.textMuted};
  font-size: 0.9rem;
`;

const HelperText = styled.p`
  margin: 0;
  color: ${(props) => props.theme.colors.textMuted};
  font-size: 0.85rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
`;

const FormRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
`;

const Select = styled.select`
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surface};
  color: ${(props) => props.theme.colors.text};
  font-size: 0.9rem;
`;

const Input = styled.input`
  flex: 1;
  min-width: 240px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surface};
  color: ${(props) => props.theme.colors.text};
  font-size: 0.9rem;
  font-family: ${(props) => props.theme.monoFontFamily};
`;

const Button = styled.button`
  padding: 10px 20px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: none;
  background: ${(props) => props.theme.colors.primary};
  color: ${(props) => props.theme.colors.primaryText};
  font-size: 0.9rem;
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

const ErrorText = styled.p`
  margin: 0;
  color: ${(props) => props.theme.colors.error};
  font-size: 0.85rem;
`;

const EditButton = styled.button`
  padding: 10px 20px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: transparent;
  color: ${(props) => props.theme.colors.text};
  font-size: 0.9rem;
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
