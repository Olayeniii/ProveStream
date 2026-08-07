import type { Payment } from '@provenance-streams/protocol';
import { useEffect, useState } from 'react';
import styled from 'styled-components';

import { AppShell } from '../components/AppShell.js';
import { UsdcIcon } from '../components/UsdcIcon.js';
import type { AppEnv } from '../env.js';
import type { ApiClient, TreasuryBalance } from '../lib/api.js';
import { formatAmount, formatReward } from '../lib/format.js';
import type { StreamTone } from '../lib/streams.js';
import { getToneColor } from '../lib/tone.js';

const PAYMENT_STATUS_TONE: Record<Payment['status'], StreamTone> = {
  complete: 'positive',
  failed: 'attention',
  pending: 'neutral',
};

export function TreasuryPage({ env, api }: { env: AppEnv; api: ApiClient }) {
  const [treasury, setTreasury] = useState<TreasuryBalance | undefined>(undefined);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    api
      .getTreasuryBalance()
      .then(setTreasury)
      .catch(() => undefined);
    api
      .listPayments()
      .then(setPayments)
      .catch(() => undefined);
  }, [api]);

  return (
    <AppShell title="Treasury" subtitle="Balance and recent settlements" env={env} api={api}>
      <Card>
        <SectionTitle>Balance</SectionTitle>
        <BalanceValue>
          {treasury ? (
            <>
              <UsdcIcon /> {formatAmount(treasury.amount, 4)} USDC
            </>
          ) : (
            'Loading…'
          )}
        </BalanceValue>
      </Card>

      <Card>
        <SectionTitle>Recent settlements</SectionTitle>
        {payments.length === 0 ? (
          <Empty>No settlements yet.</Empty>
        ) : (
          <List>
            {payments.slice(0, 20).map((payment) => (
              <ListItem key={payment.rewardId}>
                <span>Reward #{payment.rewardId}</span>
                <StatusBadge $status={payment.status}>{payment.status}</StatusBadge>
                <span>{formatReward(payment.rewardAmount)}</span>
                <span>Supplier {payment.supplier}</span>
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

const BalanceValue = styled.span`
  font-size: 1.5rem;
  font-weight: 700;
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
  gap: 16px;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: ${(props) => props.theme.colors.textMuted};
  padding: 8px 0;
  border-bottom: 1px solid ${(props) => props.theme.colors.border};
`;

const StatusBadge = styled.span<{ $status: Payment['status'] }>`
  padding: 2px 10px;
  border-radius: ${(props) => props.theme.radius.pill};
  font-size: 0.75rem;
  color: ${(props) => getToneColor(props.theme, PAYMENT_STATUS_TONE[props.$status]).text};
  background: ${(props) => getToneColor(props.theme, PAYMENT_STATUS_TONE[props.$status]).background};
`;
