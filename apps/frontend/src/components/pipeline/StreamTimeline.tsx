import styled from 'styled-components';

import { formatRelativeTime } from '../../lib/format.js';
import type { StreamNode } from '../../lib/streams.js';

export function StreamTimeline({ nodes }: { nodes: StreamNode[] }) {
  const events = nodes.filter((node) => node.timestamp);

  if (events.length === 0) {
    return <Empty>No timestamped events yet.</Empty>;
  }

  return (
    <List>
      {events.map((node) => (
        <Item key={node.key}>
          <Dot $status={node.status} />
          <Body>
            <Label>{node.label}</Label>
            {node.detail && <Detail>{node.detail}</Detail>}
          </Body>
          <Time title={new Date(node.timestamp!).toLocaleString()}>
            {formatRelativeTime(node.timestamp!)}
          </Time>
        </Item>
      ))}
    </List>
  );
}

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
`;

const Dot = styled.span<{ $status: StreamNode['status'] }>`
  position: relative;
  margin-top: 4px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
  background: ${(props) =>
    props.$status === 'failed'
      ? props.theme.colors.error
      : props.$status === 'attention'
        ? props.theme.colors.coral
        : props.theme.colors.primary};

  &::after {
    content: '';
    position: absolute;
    top: 8px;
    bottom: -22px;
    left: 3px;
    width: 2px;
    background: ${(props) => props.theme.colors.border};
  }
`;

const Item = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid ${(props) => props.theme.colors.border};

  &:last-child {
    border-bottom: none;
  }

  &:last-child ${Dot}::after {
    display: none;
  }
`;

const Body = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Label = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: ${(props) => props.theme.colors.text};
`;

const Detail = styled.span`
  font-size: 0.78rem;
  color: ${(props) => props.theme.colors.textMuted};
  overflow-wrap: anywhere;
`;

const Time = styled.span`
  font-size: 0.75rem;
  color: ${(props) => props.theme.colors.textMuted};
  white-space: nowrap;
  flex-shrink: 0;
`;

const Empty = styled.p`
  margin: 0;
  color: ${(props) => props.theme.colors.textMuted};
  font-size: 0.9rem;
`;
