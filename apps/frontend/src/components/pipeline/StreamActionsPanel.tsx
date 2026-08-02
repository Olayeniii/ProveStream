import { arcTestnet } from '@provenance-streams/protocol';
import { ExternalLink, List, Share2 } from 'lucide-react';
import { useState } from 'react';
import styled from 'styled-components';

import type { AppEnv } from '../../env.js';
import type { Stream } from '../../lib/streams.js';
import { StreamTimeline } from './StreamTimeline.js';

export function StreamActionsPanel({ stream, env }: { stream: Stream; env: AppEnv }) {
  const [showLogs, setShowLogs] = useState(false);

  const explorerUrl =
    env.chainId === arcTestnet.id && stream.payment?.txHash
      ? `${arcTestnet.blockExplorers.default.url}/tx/${stream.payment.txHash}`
      : undefined;

  function handleShare() {
    const url = `${window.location.origin}${window.location.pathname}#/streams?stream=${stream.id}`;
    navigator.clipboard?.writeText(url).catch(() => undefined);
  }

  return (
    <Panel>
      <PanelTitle>Stream Actions</PanelTitle>
      <ActionList>
        {explorerUrl && (
          <ActionLink href={explorerUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> View on Explorer
          </ActionLink>
        )}
        <ActionButton type="button" onClick={() => setShowLogs((current) => !current)}>
          <List size={16} /> {showLogs ? 'Hide event logs' : 'View event logs'}
        </ActionButton>
        <ActionButton type="button" onClick={handleShare}>
          <Share2 size={16} /> Share stream
        </ActionButton>
      </ActionList>
      {showLogs && <StreamTimeline nodes={stream.nodes} />}
    </Panel>
  );
}

const Panel = styled.div`
  padding: 20px;
  border-radius: ${(props) => props.theme.radius.card};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surface};
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const PanelTitle = styled.h3`
  margin: 0;
  font-size: 1rem;
  color: ${(props) => props.theme.colors.text};
`;

const ActionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const actionStyles = `
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  font-size: 0.85rem;
  text-decoration: none;
  cursor: pointer;
`;

const ActionLink = styled.a`
  ${actionStyles}
  border: none;
  background: none;
  color: ${(props) => props.theme.colors.primary};
`;

const ActionButton = styled.button`
  ${actionStyles}
  border: none;
  background: none;
  color: ${(props) => props.theme.colors.text};
  font-family: inherit;

  &:hover {
    color: ${(props) => props.theme.colors.primary};
  }
`;
