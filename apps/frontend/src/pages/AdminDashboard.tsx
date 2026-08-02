import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import { AppShell } from '../components/AppShell.js';
import type { ApiClient, AttestationRecord } from '../lib/api.js';

interface HealthState {
  backend: 'ok' | 'error' | 'checking';
  treasury: 'ok' | 'error' | 'checking';
}

export function AdminDashboard({ api }: { api: ApiClient }) {
  const [attestations, setAttestations] = useState<AttestationRecord[]>([]);
  const [health, setHealth] = useState<HealthState>({ backend: 'checking', treasury: 'checking' });

  useEffect(() => {
    api
      .listAttestations()
      .then(setAttestations)
      .catch(() => undefined);

    api
      .getHealth()
      .then(() => setHealth((current) => ({ ...current, backend: 'ok' })))
      .catch(() => setHealth((current) => ({ ...current, backend: 'error' })));

    api
      .getTreasuryBalance()
      .then(() => setHealth((current) => ({ ...current, treasury: 'ok' })))
      .catch(() => setHealth((current) => ({ ...current, treasury: 'error' })));
  }, [api]);

  const auditors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const attestation of attestations) {
      const key = attestation.auditor;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [attestations]);

  return (
    <AppShell title="Admin" subtitle="Known auditors and system health" api={api}>
      <Card>
        <SectionTitle>Health</SectionTitle>
        <HealthRow>
          <HealthItem status={health.backend}>
            {health.backend === 'ok' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            Backend API
          </HealthItem>
          <HealthItem status={health.treasury}>
            {health.treasury === 'ok' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            Treasury service
          </HealthItem>
        </HealthRow>
      </Card>

      <Card>
        <SectionTitle>Auditors</SectionTitle>
        {auditors.length === 0 ? (
          <Empty>No attestations observed yet.</Empty>
        ) : (
          <List>
            {auditors.map(([auditor, count]) => (
              <ListItem key={auditor}>
                <Address>{auditor}</Address>
                <span>
                  {count} submission{count === 1 ? '' : 's'}
                </span>
              </ListItem>
            ))}
          </List>
        )}
      </Card>
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

const SectionTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
  color: ${(props) => props.theme.colors.text};
`;

const HealthRow = styled.div`
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
`;

const HealthItem = styled.div<{ status: 'ok' | 'error' | 'checking' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: ${(props) =>
    props.status === 'ok'
      ? '#166534'
      : props.status === 'error'
        ? props.theme.colors.error
        : props.theme.colors.textMuted};
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
  gap: 16px;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: ${(props) => props.theme.colors.textMuted};
  padding: 8px 0;
  border-bottom: 1px solid ${(props) => props.theme.colors.border};
`;

const Address = styled.code`
  color: ${(props) => props.theme.colors.text};
`;
