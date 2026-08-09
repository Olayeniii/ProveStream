import type {
  AgentHealth,
  EvidenceSubmission,
  FraudAlert,
  Payment,
  RiskAnalysis,
  SettlementJobRecord,
  SignatureVerification,
} from '@provenance-streams/protocol';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import { AppShell } from '../components/AppShell.js';
import { TriggerLogPanel } from '../components/TriggerLogPanel.js';
import type { AppEnv } from '../env.js';
import type { ApiClient, AttestationRecord } from '../lib/api.js';
import { formatRelativeTime } from '../lib/format.js';
import type { StreamTone } from '../lib/streams.js';
import { getToneColor } from '../lib/tone.js';
import { buildTriggerLog } from '../lib/triggerLog.js';

interface HealthState {
  backend: 'ok' | 'error' | 'checking';
  treasury: 'ok' | 'error' | 'checking';
}

const HEALTH_STATUS_TONE: Record<HealthState['backend'], StreamTone> = {
  ok: 'positive',
  error: 'negative',
  checking: 'neutral',
};

const FRAUD_ALERT_STATUS_TONE: Record<FraudAlert['status'], StreamTone> = {
  approved: 'positive',
  flagged: 'negative',
  rejected: 'negative',
};

const JOB_STATE_LABEL: Record<SettlementJobRecord['state'], string> = {
  queued: 'Queued',
  processing: 'Processing',
  retrying: 'Retrying',
  settled: 'Settled',
  failed: 'Failed',
};

/**
 * `SettlementJobRecord.state` is queue mechanics, not proof money moved — a
 * reward id can be reused across a fresh contract deployment or a snapshot
 * reset, leaving a stale 'settled' job entry for a reward that never
 * actually paid out under its current Payment record. `Payment.status` is
 * the one driven directly by a confirmed txHash, so when both exist for the
 * same reward, it wins.
 */
function settlementJobLabel(job: SettlementJobRecord, payments: Payment[]): string {
  const payment = payments.find((entry) => entry.rewardId === job.rewardId);
  if (payment) {
    if (payment.status === 'complete') {
      return 'Settled';
    }
    if (payment.status === 'failed') {
      return 'Failed';
    }
    if (job.state === 'settled') {
      return 'Pending';
    }
  }
  return JOB_STATE_LABEL[job.state];
}

/** Not a long-lived credential — cleared on tab close, unlike `localStorage`. */
const ADMIN_TOKEN_STORAGE_KEY = 'adminToken';

export function AdminDashboard({ env, api }: { env: AppEnv; api: ApiClient }) {
  const [adminToken, setAdminToken] = useState<string | undefined>(
    () => sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? undefined,
  );
  const [loginValue, setLoginValue] = useState('');
  const [loginError, setLoginError] = useState<string | undefined>(undefined);
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLogin = () => {
    if (!loginValue.trim()) {
      return;
    }
    setLoginError(undefined);
    setLoggingIn(true);
    api
      .adminLogin(loginValue)
      .then((result) => {
        if (!result.ok) {
          setLoginError('Incorrect admin token.');
          return;
        }
        sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, loginValue);
        setAdminToken(loginValue);
      })
      .catch((error: unknown) =>
        setLoginError(error instanceof Error ? error.message : 'Failed to sign in.'),
      )
      .finally(() => setLoggingIn(false));
  };

  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setAdminToken(undefined);
  };

  const [attestations, setAttestations] = useState<AttestationRecord[]>([]);
  const [health, setHealth] = useState<HealthState>({ backend: 'checking', treasury: 'checking' });
  const [agentHealth, setAgentHealth] = useState<AgentHealth | undefined>(undefined);
  const [settlementQueue, setSettlementQueue] = useState<SettlementJobRecord[]>([]);
  const [fraudAlerts, setFraudAlerts] = useState<FraudAlert[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [riskAnalyses, setRiskAnalyses] = useState<RiskAnalysis[]>([]);
  const [signatureVerifications, setSignatureVerifications] = useState<SignatureVerification[]>([]);
  const [evidenceSubmissions, setEvidenceSubmissions] = useState<EvidenceSubmission[]>([]);
  const [alertActionError, setAlertActionError] = useState<string | undefined>(undefined);

  const refresh = useCallback(() => {
    if (!adminToken) {
      return;
    }
    api
      .listAttestations()
      .then(setAttestations)
      .catch(() => undefined);
    api
      .getAgentHealth(adminToken)
      .then(setAgentHealth)
      .catch(() => undefined);
    api
      .listSettlementQueue(adminToken)
      .then(setSettlementQueue)
      .catch(() => undefined);
    api
      .listFraudAlerts(adminToken)
      .then(setFraudAlerts)
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
      .listEvidenceSubmissions()
      .then(setEvidenceSubmissions)
      .catch(() => undefined);
  }, [api, adminToken]);

  const triggerLog = useMemo(
    () =>
      buildTriggerLog(
        attestations,
        payments,
        riskAnalyses,
        signatureVerifications,
        fraudAlerts,
        settlementQueue,
        evidenceSubmissions,
      ),
    [
      attestations,
      payments,
      riskAnalyses,
      signatureVerifications,
      fraudAlerts,
      settlementQueue,
      evidenceSubmissions,
    ],
  );

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!adminToken) {
      return;
    }
    api
      .getHealth()
      .then(() => setHealth((current) => ({ ...current, backend: 'ok' })))
      .catch(() => setHealth((current) => ({ ...current, backend: 'error' })));

    api
      .getTreasuryBalance()
      .then(() => setHealth((current) => ({ ...current, treasury: 'ok' })))
      .catch(() => setHealth((current) => ({ ...current, treasury: 'error' })));
  }, [api, adminToken]);

  const auditors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const attestation of attestations) {
      const key = attestation.auditor;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [attestations]);

  const bridgeOperations = useMemo(
    () => payments.filter((payment) => payment.bridged).slice(0, 10),
    [payments],
  );

  const handleAlertAction = (rewardId: string, action: 'approve' | 'reject') => {
    if (!adminToken) {
      return;
    }
    setAlertActionError(undefined);
    const call =
      action === 'approve'
        ? api.approveFraudAlert(rewardId, adminToken)
        : api.rejectFraudAlert(rewardId, adminToken);
    call.then(refresh).catch((error: unknown) => {
      setAlertActionError(error instanceof Error ? error.message : `Failed to ${action} payout.`);
    });
  };

  if (!adminToken) {
    return (
      <AppShell
        title="Admin"
        subtitle="System health, settlement queue, and fraud review"
        env={env}
        api={api}
      >
        <Card>
          <SectionTitle>Sign in</SectionTitle>
          <LoginRow>
            <LoginInput
              type="password"
              placeholder="Admin token"
              value={loginValue}
              onChange={(event) => setLoginValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleLogin();
                }
              }}
              disabled={loggingIn}
            />
            <LoginButton onClick={handleLogin} disabled={loggingIn}>
              {loggingIn ? 'Signing in…' : 'Sign in'}
            </LoginButton>
          </LoginRow>
          {loginError && <ErrorText>{loginError}</ErrorText>}
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Admin"
      subtitle="System health, settlement queue, and fraud review"
      env={env}
      api={api}
      headerActions={<SignOutButton onClick={handleLogout}>Sign out</SignOutButton>}
    >
      <Card>
        <SectionTitle>Health</SectionTitle>
        <HealthRow>
          <HealthItem $status={health.backend}>
            {health.backend === 'ok' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            Backend API
          </HealthItem>
          <HealthItem $status={health.treasury}>
            {health.treasury === 'ok' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            Treasury service
          </HealthItem>
        </HealthRow>
        {agentHealth && (
          <StatRow>
            <Stat>
              <StatLabel>Queue depth</StatLabel>
              <StatValue>{agentHealth.queueDepth}</StatValue>
            </Stat>
            <Stat>
              <StatLabel>Treasury mode</StatLabel>
              <StatValue>{agentHealth.treasuryMode}</StatValue>
            </Stat>
            <Stat>
              <StatLabel>Pending fraud alerts</StatLabel>
              <StatValue>{agentHealth.pendingFraudAlerts}</StatValue>
            </Stat>
            <Stat>
              <StatLabel>Last event</StatLabel>
              <StatValue>
                {agentHealth.lastEventAt ? formatRelativeTime(agentHealth.lastEventAt) : 'None yet'}
              </StatValue>
            </Stat>
          </StatRow>
        )}
      </Card>

      <Card>
        <SectionTitle>Fraud alerts</SectionTitle>
        {alertActionError && <ErrorText>{alertActionError}</ErrorText>}
        {fraudAlerts.length === 0 ? (
          <Empty>No payouts have been flagged for review.</Empty>
        ) : (
          <List>
            {fraudAlerts.map((alert) => (
              <AlertItem key={alert.rewardId}>
                <AlertHeader>
                  <span>
                    Reward #{alert.rewardId} · <Address>{alert.supplier}</Address>
                  </span>
                  <ScoreBadge score={alert.score}>{alert.score}/100</ScoreBadge>
                </AlertHeader>
                <ReasonList>
                  {alert.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ReasonList>
                {alert.status === 'flagged' ? (
                  <ActionRow>
                    <ApproveButton onClick={() => handleAlertAction(alert.rewardId, 'approve')}>
                      Approve payout
                    </ApproveButton>
                    <RejectButton onClick={() => handleAlertAction(alert.rewardId, 'reject')}>
                      Reject
                    </RejectButton>
                  </ActionRow>
                ) : (
                  <StatusLabel $status={alert.status}>{alert.status}</StatusLabel>
                )}
              </AlertItem>
            ))}
          </List>
        )}
      </Card>

      <Section>
        <SectionTitle>Settlement queue</SectionTitle>
        {settlementQueue.length === 0 ? (
          <Empty>No settlement jobs observed yet.</Empty>
        ) : (
          <List>
            {settlementQueue.map((job) => (
              <ListItem key={job.rewardId}>
                <span>Reward #{job.rewardId}</span>
                <span>
                  {settlementJobLabel(job, payments)}
                  {job.attempt ? ` (attempt ${job.attempt.toString()})` : ''}
                </span>
              </ListItem>
            ))}
          </List>
        )}
      </Section>

      <Section>
        <SectionTitle>Recent bridge operations</SectionTitle>
        {bridgeOperations.length === 0 ? (
          <Empty>No cross-chain settlements yet.</Empty>
        ) : (
          <List>
            {bridgeOperations.map((payment) => (
              <ListItem key={payment.rewardId}>
                <span>
                  Reward #{payment.rewardId} → {payment.destinationChain?.replace('_', ' ')}
                </span>
                <span>{payment.status}</span>
              </ListItem>
            ))}
          </List>
        )}
      </Section>

      <Section>
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
      </Section>

      <Card>
        <SectionTitle>Trigger log</SectionTitle>
        <TriggerLogPanel entries={triggerLog} />
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

// Plain listing content, unlike Card above — no border/background/elevation.
// Elevation should signal "you can act here" (Health, Fraud alerts); a
// read-only list doesn't need a box around it, just a heading and divide-y rows.
const Section = styled.div`
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

const HealthItem = styled.div<{ $status: 'ok' | 'error' | 'checking' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: ${(props) => getToneColor(props.theme, HEALTH_STATUS_TONE[props.$status]).text};
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
  color: ${(props) => props.theme.colors.text};
`;

const Empty = styled.p`
  margin: 0;
  color: ${(props) => props.theme.colors.textMuted};
  font-size: 0.9rem;
`;

const ErrorText = styled.p`
  margin: 0;
  color: ${(props) => props.theme.colors.error};
  font-size: 0.85rem;
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

const AlertItem = styled.li`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid ${(props) => props.theme.colors.border};
  font-size: 0.85rem;
  color: ${(props) => props.theme.colors.text};
`;

const AlertHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const ScoreBadge = styled.span<{ score: number }>`
  padding: 2px 10px;
  border-radius: ${(props) => props.theme.radius.pill};
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  background: ${(props) => (props.score >= 70 ? props.theme.colors.error : props.theme.colors.coral)};
`;

const ReasonList = styled.ul`
  margin: 0;
  padding-left: 18px;
  color: ${(props) => props.theme.colors.textMuted};
  font-size: 0.8rem;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 8px;
`;

const ApproveButton = styled.button`
  padding: 6px 16px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: none;
  background: ${(props) => props.theme.colors.mint};
  color: ${(props) => props.theme.colors.dark};
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 160ms ease-out;

  &:active {
    transform: scale(0.97);
  }
`;

const RejectButton = styled.button`
  padding: 6px 16px;
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
`;

const StatusLabel = styled.span<{ $status: FraudAlert['status'] }>`
  align-self: flex-start;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${(props) => getToneColor(props.theme, FRAUD_ALERT_STATUS_TONE[props.$status]).text};
`;

const LoginRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const LoginInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 10px 12px;
  border-radius: ${(props) => props.theme.radius.card};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surfaceMuted};
  color: ${(props) => props.theme.colors.text};
  font-size: 0.9rem;

  &:disabled {
    opacity: 0.6;
  }
`;

const LoginButton = styled.button`
  padding: 10px 16px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: none;
  background: ${(props) => props.theme.colors.primary};
  color: ${(props) => props.theme.colors.primaryText};
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 160ms ease-out;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }
`;

const SignOutButton = styled.button`
  padding: 6px 14px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: transparent;
  color: ${(props) => props.theme.colors.textMuted};
  font-size: 0.8rem;
  cursor: pointer;

  &:hover {
    color: ${(props) => props.theme.colors.text};
  }
`;
