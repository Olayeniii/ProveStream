import { arcTestnet } from '@provenance-streams/protocol';
import { ChevronRight, Download, ExternalLink, FileText, List, Share2 } from 'lucide-react';
import { useState } from 'react';
import styled from 'styled-components';

import type { AppEnv } from '../../env.js';
import type { Stream } from '../../lib/streams.js';
import { StreamTimeline } from './StreamTimeline.js';

export function StreamActionsPanel({ stream, env }: { stream: Stream; env: AppEnv }) {
  const [showAttestation, setShowAttestation] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const explorerUrl =
    env.chainId === arcTestnet.id && stream.payment?.txHash
      ? `${arcTestnet.blockExplorers.default.url}/tx/${stream.payment.txHash}`
      : undefined;

  function handleShare() {
    const url = `${window.location.origin}${window.location.pathname}#/streams?stream=${stream.id}`;
    navigator.clipboard?.writeText(url).catch(() => undefined);
  }

  function handleDownloadProof() {
    const proof = {
      attestation: stream.attestation,
      policy: stream.policy,
      payment: stream.payment,
    };
    const blob = new Blob([JSON.stringify(proof, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attestation-${stream.id}-proof.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel>
      <PanelTitle>Stream Actions</PanelTitle>
      <ActionList>
        <ActionButton type="button" onClick={() => setShowAttestation((current) => !current)}>
          <ActionLeft>
            <FileText size={16} /> {showAttestation ? 'Hide attestation' : 'View attestation'}
          </ActionLeft>
          <ChevronRight size={16} />
        </ActionButton>
        <ActionButton type="button" onClick={handleDownloadProof}>
          <ActionLeft>
            <Download size={16} /> Download proof
          </ActionLeft>
          <ChevronRight size={16} />
        </ActionButton>
        <ActionButton type="button" onClick={() => setShowLogs((current) => !current)}>
          <ActionLeft>
            <List size={16} /> {showLogs ? 'Hide event logs' : 'View event logs'}
          </ActionLeft>
          <ChevronRight size={16} />
        </ActionButton>
        <ActionButton type="button" onClick={handleShare}>
          <ActionLeft>
            <Share2 size={16} /> Share stream
          </ActionLeft>
          <ChevronRight size={16} />
        </ActionButton>
        {explorerUrl && (
          <ActionLink href={explorerUrl} target="_blank" rel="noreferrer">
            <ActionLeft>
              <ExternalLink size={16} /> View on explorer
            </ActionLeft>
            <ChevronRight size={16} />
          </ActionLink>
        )}
      </ActionList>
      {showAttestation && (
        <Detail>
          <DetailRow>
            <span>Supplier</span>
            <code>{stream.attestation.supplier}</code>
          </DetailRow>
          <DetailRow>
            <span>Auditor</span>
            <code>{stream.attestation.auditor}</code>
          </DetailRow>
          <DetailRow>
            <span>Policy ID</span>
            <code>#{stream.attestation.policyId}</code>
          </DetailRow>
          <DetailRow>
            <span>Observed</span>
            <code>{new Date(stream.attestation.observedAt).toLocaleString()}</code>
          </DetailRow>
        </Detail>
      )}
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
  gap: 2px;
`;

const ActionLeft = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const actionStyles = `
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  color: ${(props) => props.theme.colors.text};

  &:hover {
    color: ${(props) => props.theme.colors.primary};
  }
`;

const ActionButton = styled.button`
  ${actionStyles}
  border: none;
  background: none;
  color: ${(props) => props.theme.colors.text};
  font-family: inherit;
  width: 100%;

  &:hover {
    color: ${(props) => props.theme.colors.primary};
  }
`;

const Detail = styled.div`
  padding: 12px;
  border-radius: ${(props) => props.theme.radius.card};
  background: ${(props) => props.theme.colors.surfaceMuted};
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const DetailRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.78rem;
  color: ${(props) => props.theme.colors.textMuted};

  code {
    color: ${(props) => props.theme.colors.text};
    word-break: break-all;
    text-align: right;
  }
`;
