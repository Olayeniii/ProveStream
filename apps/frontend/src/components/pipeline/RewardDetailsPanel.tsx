import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import styled from 'styled-components';

import type { Stream } from '../../lib/streams.js';
import { getOverallStatus } from '../../lib/streams.js';

function truncate(value: string): string {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function RewardDetailsPanel({ stream }: { stream: Stream }) {
  const status = getOverallStatus(stream);

  return (
    <Panel>
      <PanelTitle>Reward Details</PanelTitle>
      <Row>
        <Label>Amount</Label>
        <Value>{stream.payment ? `${stream.payment.rewardAmount} (raw units)` : '—'}</Value>
      </Row>
      <Row>
        <Label>Policy</Label>
        <Value>{stream.policy?.credentialType ?? `#${stream.attestation.policyId}`}</Value>
      </Row>
      <Row>
        <Label>Attestation ID</Label>
        <Value>#{stream.attestation.id}</Value>
      </Row>
      <Row>
        <Label>Recipient</Label>
        <CopyableValue value={stream.attestation.supplier} />
      </Row>
      <Row>
        <Label>Status</Label>
        <Value>{status.label}</Value>
      </Row>
      {stream.payment?.txHash && (
        <Row>
          <Label>Tx Hash</Label>
          <CopyableValue value={stream.payment.txHash} />
        </Row>
      )}
    </Panel>
  );
}

function CopyableValue({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  }

  return (
    <HashRow>
      <Hash onClick={() => setExpanded((current) => !current)} title="Click to expand">
        {expanded ? value : truncate(value)}
      </Hash>
      <CopyButton type="button" onClick={handleCopy} aria-label="Copy to clipboard">
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </CopyButton>
    </HashRow>
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

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.85rem;
`;

const Label = styled.span`
  color: ${(props) => props.theme.colors.textMuted};
`;

const Value = styled.span`
  font-weight: 600;
  color: ${(props) => props.theme.colors.text};
  text-align: right;
`;

const HashRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const Hash = styled.button`
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-family: ${(props) => props.theme.monoFontFamily};
  font-size: 0.78rem;
  color: ${(props) => props.theme.colors.text};
`;

const CopyButton = styled.button`
  border: none;
  background: none;
  padding: 2px;
  cursor: pointer;
  color: ${(props) => props.theme.colors.textMuted};
  display: flex;

  &:hover {
    color: ${(props) => props.theme.colors.primary};
  }
`;
