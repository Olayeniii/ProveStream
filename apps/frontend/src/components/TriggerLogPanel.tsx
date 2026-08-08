import styled from 'styled-components';

import { formatRelativeTime } from '../lib/format.js';
import { getToneColor } from '../lib/tone.js';
import type { TriggerLogEntry } from '../lib/triggerLog.js';

export function TriggerLogPanel({ entries }: { entries: TriggerLogEntry[] }) {
  if (entries.length === 0) {
    return <Empty>No agent activity observed yet.</Empty>;
  }

  return (
    <List>
      {entries.map((entry) => (
        <Item key={entry.id}>
          <Dot $tone={entry.tone} />
          <Message>{entry.message}</Message>
          <Time title={new Date(entry.timestamp).toLocaleString()}>
            {formatRelativeTime(entry.timestamp)}
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
  max-height: 360px;
  overflow-y: auto;
`;

const Dot = styled.span<{ $tone: TriggerLogEntry['tone'] }>`
  margin-top: 6px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
  background: ${(props) => getToneColor(props.theme, props.$tone).text};
`;

const Item = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid ${(props) => props.theme.colors.border};

  &:last-child {
    border-bottom: none;
  }
`;

const Message = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
  color: ${(props) => props.theme.colors.text};
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
