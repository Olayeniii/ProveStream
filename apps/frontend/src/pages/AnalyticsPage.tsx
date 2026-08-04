import type { Payment, RiskAnalysis } from '@provenance-streams/protocol';
import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { formatUnits } from 'viem';

import { AppShell } from '../components/AppShell.js';
import { UsdcIcon } from '../components/UsdcIcon.js';
import type { AppEnv } from '../env.js';
import type { ApiClient, AttestationRecord, PolicySummary } from '../lib/api.js';
import { formatAmount } from '../lib/format.js';
import { buildStreams, getOverallStatus } from '../lib/streams.js';

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  if (seconds < 3600) {
    return `${(seconds / 60).toFixed(1)}m`;
  }
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function AnalyticsPage({ env, api }: { env: AppEnv; api: ApiClient }) {
  const [attestations, setAttestations] = useState<AttestationRecord[]>([]);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [riskAnalyses, setRiskAnalyses] = useState<RiskAnalysis[]>([]);

  useEffect(() => {
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
  }, [api]);

  const streams = useMemo(
    () => buildStreams(attestations, policies, payments, riskAnalyses),
    [attestations, policies, payments, riskAnalyses],
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const stream of streams) {
      const { label } = getOverallStatus(stream);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [streams]);

  const totalRewardsPaid = useMemo(
    () =>
      formatAmount(
        formatUnits(
          payments
            .filter((payment) => payment.status === 'complete')
            .reduce((sum, payment) => sum + BigInt(payment.rewardAmount), 0n),
          18,
        ),
        4,
      ),
    [payments],
  );

  const successfulSettlements = useMemo(
    () => payments.filter((payment) => payment.status === 'complete').length,
    [payments],
  );
  const failedSettlements = useMemo(
    () => payments.filter((payment) => payment.status === 'failed').length,
    [payments],
  );
  const activeSuppliers = useMemo(
    () => new Set(attestations.map((attestation) => attestation.supplier.toLowerCase())).size,
    [attestations],
  );
  const activeAuditors = useMemo(
    () => new Set(attestations.map((attestation) => attestation.auditor.toLowerCase())).size,
    [attestations],
  );

  const averageSettlementSeconds = useMemo(() => {
    const attestationsById = new Map(
      attestations.map((attestation) => [attestation.id, attestation]),
    );
    const durations = payments
      .filter((payment) => payment.status === 'complete')
      .map((payment) => {
        const attestation = attestationsById.get(payment.attestationId);
        if (!attestation) {
          return undefined;
        }
        const start = new Date(attestation.observedAt).getTime();
        const end = new Date(payment.updatedAt).getTime();
        return (end - start) / 1000;
      })
      .filter(
        (value): value is number => value !== undefined && Number.isFinite(value) && value >= 0,
      );

    if (durations.length === 0) {
      return undefined;
    }
    return durations.reduce((sum, value) => sum + value, 0) / durations.length;
  }, [attestations, payments]);

  return (
    <AppShell
      title="Analytics"
      subtitle="Aggregate stream and settlement metrics"
      env={env}
      api={api}
    >
      <StatGrid>
        <StatCard>
          <StatLabel>Total Streams</StatLabel>
          <StatValue>{streams.length}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Total Rewards Paid</StatLabel>
          <StatValue>
            <UsdcIcon /> {totalRewardsPaid} USDC
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Avg. Attestation → Paid</StatLabel>
          <StatValue>
            {averageSettlementSeconds !== undefined
              ? formatDuration(averageSettlementSeconds)
              : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Successful Settlements</StatLabel>
          <StatValue>{successfulSettlements}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Failed Settlements</StatLabel>
          <StatValue>{failedSettlements}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Active Suppliers</StatLabel>
          <StatValue>{activeSuppliers}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Active Auditors</StatLabel>
          <StatValue>{activeAuditors}</StatValue>
        </StatCard>
      </StatGrid>

      <Card>
        <SectionTitle>Streams by status</SectionTitle>
        {statusCounts.length === 0 ? (
          <Empty>No streams yet.</Empty>
        ) : (
          <List>
            {statusCounts.map(([label, count]) => (
              <ListItem key={label}>
                <span>{label}</span>
                <span>{count}</span>
              </ListItem>
            ))}
          </List>
        )}
      </Card>
    </AppShell>
  );
}

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
`;

const StatCard = styled.div`
  background: ${(props) => props.theme.colors.surface};
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: ${(props) => props.theme.radius.card};
  padding: 20px;
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
  font-size: 1.5rem;
  font-weight: 700;
  color: ${(props) => props.theme.colors.text};
`;

const Card = styled.div`
  background: ${(props) => props.theme.colors.surface};
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: ${(props) => props.theme.radius.card};
  padding: ${(props) => props.theme.spacing.cardPadding};
  display: flex;
  flex-direction: column;
  gap: 16px;
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

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ListItem = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.9rem;
  color: ${(props) => props.theme.colors.text};
  padding: 8px 0;
  border-bottom: 1px solid ${(props) => props.theme.colors.border};
`;
