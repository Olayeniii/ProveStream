import type { Payment } from '@provenance-streams/protocol';
import { useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';
import styled from 'styled-components';

import { AppShell } from '../components/AppShell.js';
import { EmbeddedWalletLogin } from '../components/EmbeddedWalletLogin.js';
import { StreamCard } from '../components/pipeline/StreamCard.js';
import { WalletChip } from '../components/WalletChip.js';
import type { AppEnv } from '../env.js';
import { useEmbeddedWallet } from '../hooks/useEmbeddedWallet.js';
import type { ApiClient, AttestationRecord, PolicySummary } from '../lib/api.js';
import { getPublicClient } from '../lib/clients.js';
import { buildStreams } from '../lib/streams.js';

export function SupplierDashboard({ env, api }: { env: AppEnv; api: ApiClient }) {
  const wallet = useEmbeddedWallet('supplier', api);
  const [balance, setBalance] = useState<string | undefined>(undefined);
  const [attestations, setAttestations] = useState<AttestationRecord[]>([]);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

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
  }, [api, env, wallet.status, wallet.walletAddress]);

  const myStreams = useMemo(() => {
    if (!wallet.walletAddress) {
      return [];
    }
    const mine = attestations.filter(
      (attestation) => attestation.supplier.toLowerCase() === wallet.walletAddress?.toLowerCase(),
    );
    return buildStreams(mine, policies, payments);
  }, [attestations, policies, payments, wallet.walletAddress]);

  return (
    <AppShell
      title="Supplier"
      subtitle="Wallet, rewards, and completed streams"
      api={api}
      headerActions={
        wallet.status === 'ready' && wallet.walletAddress ? (
          <WalletChip address={wallet.walletAddress} onSignOut={wallet.logout} />
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
              <StatLabel>Address</StatLabel>
              <StatValue as="code">{wallet.walletAddress}</StatValue>
            </Stat>
            <Stat>
              <StatLabel>USDC balance</StatLabel>
              <StatValue>{balance ?? 'Loading…'}</StatValue>
            </Stat>
          </StatRow>
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

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
`;
