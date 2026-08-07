import { encodeCredentialType, rewardPolicyAbi } from '@provenance-streams/protocol';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { parseEventLogs, parseUnits } from 'viem';
import styled from 'styled-components';

import { AppShell } from '../components/AppShell.js';
import type { AppEnv } from '../env.js';
import type { ApiClient, PolicySummary } from '../lib/api.js';
import { formatReward } from '../lib/format.js';
import { connectWallet, getPublicClient } from '../lib/clients.js';
import { getToneColor } from '../lib/tone.js';

export function PoliciesPage({ env, api }: { env: AppEnv; api: ApiClient }) {
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [credentialType, setCredentialType] = useState('');
  const [rewardAmount, setRewardAmount] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    api
      .listPolicies()
      .then(setPolicies)
      .catch(() => undefined);
  }, [api, refreshCount]);

  async function handleCreatePolicy(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError(undefined);

    try {
      const walletClient = await connectWallet(env);
      const publicClient = getPublicClient(env);
      const hash = await walletClient.writeContract({
        address: env.rewardPolicyAddress,
        abi: rewardPolicyAbi,
        functionName: 'createPolicy',
        args: [encodeCredentialType(credentialType), parseUnits(rewardAmount, 18)],
        chain: walletClient.chain,
        account: walletClient.account!,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setCredentialType('');
      setRewardAmount('');

      // The backend's policy list is backfilled from `PolicyCreated` history via an
      // incremental chain scan that can lag far behind the tip under RPC rate
      // limiting — register the id we just minted directly so it shows up now
      // instead of whenever that scan eventually catches up.
      const [created] = parseEventLogs({
        abi: rewardPolicyAbi,
        eventName: 'PolicyCreated',
        logs: receipt.logs,
      });
      if (created) {
        await api.registerKnownPolicy(created.args.id.toString()).catch(() => undefined);
      }

      setRefreshCount((count) => count + 1);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create policy.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell
      title="Policies"
      subtitle="Configure which credentials earn a reward, and how much"
      env={env}
      api={api}
    >
      <Card>
        <SectionTitle>Create a policy</SectionTitle>
        <Form onSubmit={(event) => void handleCreatePolicy(event)}>
          <Input
            placeholder="Credential type (e.g. ISO-9001-AUDIT)"
            value={credentialType}
            onChange={(event) => setCredentialType(event.target.value)}
            disabled={creating}
            required
          />
          <Input
            placeholder="Reward amount (USDC)"
            value={rewardAmount}
            onChange={(event) => setRewardAmount(event.target.value)}
            disabled={creating}
            required
          />
          <SubmitButton type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create policy'}
          </SubmitButton>
        </Form>
        {createError && <ErrorText>{createError}</ErrorText>}
      </Card>

      <Section>
        <SectionTitle>All policies</SectionTitle>
        {policies.length === 0 ? (
          <Empty>No policies created yet.</Empty>
        ) : (
          <List>
            {policies.map((policy) => (
              <ListItem key={policy.id}>
                <span>#{policy.id}</span>
                <span>{policy.credentialType}</span>
                <span>{formatReward(policy.rewardAmount)}</span>
                <StatusBadge $enabled={policy.enabled}>
                  {policy.enabled ? 'enabled' : 'disabled'}
                </StatusBadge>
              </ListItem>
            ))}
          </List>
        )}
      </Section>
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
// Elevation should signal "you can act here" (see the create form's Card); a
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

const Form = styled.form`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const Input = styled.input`
  flex: 1;
  min-width: 160px;
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

const SubmitButton = styled.button`
  padding: 10px 16px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: none;
  background: ${(props) => props.theme.colors.primary};
  color: ${(props) => props.theme.colors.primaryText};
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 160ms ease-out;

  &:active {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.span`
  font-size: 0.8rem;
  color: ${(props) => props.theme.colors.error};
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

const StatusBadge = styled.span<{ $enabled: boolean }>`
  padding: 2px 10px;
  border-radius: ${(props) => props.theme.radius.pill};
  font-size: 0.75rem;
  color: ${(props) => getToneColor(props.theme, props.$enabled ? 'positive' : 'neutral').text};
  background: ${(props) =>
    getToneColor(props.theme, props.$enabled ? 'positive' : 'neutral').background};
`;
