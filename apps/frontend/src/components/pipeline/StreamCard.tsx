import styled from 'styled-components';

import { formatReward } from '../../lib/format.js';
import type { Stream, StreamTone } from '../../lib/streams.js';
import { getOverallStatus } from '../../lib/streams.js';

export function StreamCard({
  stream,
  selected,
  onClick,
}: {
  stream: Stream;
  selected?: boolean;
  onClick?: () => void;
}) {
  const status = getOverallStatus(stream);

  return (
    <Card as={onClick ? 'button' : 'div'} $selected={selected} $clickable={Boolean(onClick)} onClick={onClick}>
      <TopRow>
        <Title>Attestation #{stream.id}</Title>
        <Badge $tone={status.tone}>{status.label}</Badge>
      </TopRow>
      <Subtitle>{stream.policy?.credentialType ?? `Policy #${stream.attestation.policyId}`}</Subtitle>
      {stream.payment && <Amount>{formatReward(stream.payment.rewardAmount)}</Amount>}
      <MiniPipeline>
        {stream.nodes.map((node) => (
          <Dot key={node.key} $status={node.status} title={node.label} />
        ))}
      </MiniPipeline>
    </Card>
  );
}

const Card = styled.div<{ $selected?: boolean | undefined; $clickable?: boolean | undefined }>`
  text-align: left;
  cursor: ${(props) => (props.$clickable ? 'pointer' : 'default')};
  padding: 20px;
  border-radius: ${(props) => props.theme.radius.card};
  border: 1px solid
    ${(props) => (props.$selected ? props.theme.colors.primary : props.theme.colors.border)};
  background: ${(props) => props.theme.colors.surface};
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  font-family: inherit;
`;

const TopRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const Title = styled.span`
  font-weight: 700;
  font-size: 0.95rem;
  color: ${(props) => props.theme.colors.text};
`;

const Badge = styled.span<{ $tone: StreamTone }>`
  padding: 3px 10px;
  border-radius: ${(props) => props.theme.radius.pill};
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  color: ${(props) =>
    props.$tone === 'positive'
      ? '#166534'
      : props.$tone === 'warning'
        ? '#92400E'
        : props.$tone === 'negative'
          ? '#9A3412'
          : props.theme.colors.textMuted};
  background: ${(props) =>
    props.$tone === 'positive'
      ? `${props.theme.colors.mint}33`
      : props.$tone === 'warning'
        ? `${props.theme.colors.gold}33`
        : props.$tone === 'negative'
          ? `${props.theme.colors.coral}33`
          : props.theme.colors.surfaceMuted};
`;

const Subtitle = styled.span`
  font-size: 0.85rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const Amount = styled.span`
  font-size: 0.85rem;
  font-family: ${(props) => props.theme.monoFontFamily};
  color: ${(props) => props.theme.colors.text};
`;

const MiniPipeline = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 4px;
`;

const Dot = styled.span<{ $status: string }>`
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: ${(props) =>
    props.$status === 'complete'
      ? props.theme.colors.primary
      : props.$status === 'active'
        ? props.theme.colors.gold
        : props.$status === 'failed'
          ? props.theme.colors.error
          : props.theme.colors.border};
`;
