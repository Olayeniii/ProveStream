import styled, { keyframes } from 'styled-components';

import { formatRelativeTime, formatReward } from '../../lib/format.js';
import type { Stream, StreamTone } from '../../lib/streams.js';
import { getOverallStatus } from '../../lib/streams.js';
import { getToneColor } from '../../lib/tone.js';

function latestTimestamp(stream: Stream): string | undefined {
  const timestamps = stream.nodes
    .map((node) => node.timestamp)
    .filter((value): value is string => !!value);
  return timestamps.sort().at(-1);
}

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
  const latest = latestTimestamp(stream);

  return (
    <Card
      as={onClick ? 'button' : 'div'}
      $selected={selected}
      $clickable={Boolean(onClick)}
      onClick={onClick}
    >
      <TopRow>
        <Title>Attestation #{stream.id}</Title>
        <Badge $tone={status.tone}>{status.label}</Badge>
      </TopRow>
      <Subtitle>
        {stream.policy?.credentialType ?? `Policy #${stream.attestation.policyId}`}
      </Subtitle>
      {stream.payment && <Amount>{formatReward(stream.payment.rewardAmount)}</Amount>}
      <MiniPipeline>
        {stream.nodes.map((node) => (
          <Dot key={node.key} $status={node.status} title={node.label} />
        ))}
      </MiniPipeline>
      {latest && (
        <Timestamp title={new Date(latest).toLocaleString()}>
          {formatRelativeTime(latest)}
        </Timestamp>
      )}
    </Card>
  );
}

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

// Staggers the first N cards in a grid/list on mount; beyond that, cards appear
// together rather than making a long list take seconds to finish entering.
const STAGGER_MAX_CARDS = 8;
const STAGGER_STEP_MS = 50;
const staggerRules = Array.from(
  { length: STAGGER_MAX_CARDS },
  (_, index) => `&:nth-child(${index + 1}) { animation-delay: ${index * STAGGER_STEP_MS}ms; }`,
).join('\n');

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
  transition: transform 160ms ease-out;

  ${(props) =>
    props.$clickable &&
    `
  &:active {
    transform: scale(0.98);
  }
  `}

  @media (prefers-reduced-motion: no-preference) {
    animation: ${fadeIn} 300ms ease-out backwards;
    ${staggerRules}
  }
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
  color: ${(props) => getToneColor(props.theme, props.$tone).text};
  background: ${(props) => getToneColor(props.theme, props.$tone).background};
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
          : props.$status === 'attention'
            ? props.theme.colors.coral
            : props.theme.colors.border};
`;

const Timestamp = styled.span`
  font-size: 0.72rem;
  color: ${(props) => props.theme.colors.textMuted};
  margin-top: 2px;
`;
