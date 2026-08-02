import { Cpu, FileText, RefreshCw, ShieldCheck, Target, User, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styled, { keyframes } from 'styled-components';

import type { NodeStatus, StreamNode } from '../../lib/streams.js';

const ICONS: Record<string, LucideIcon> = {
  'attestation-submitted': FileText,
  'signature-verified': ShieldCheck,
  'policy-matched': Target,
  'ai-risk-analysis': Cpu,
  'treasury-approved': Wallet,
  'circle-settlement': RefreshCw,
  'supplier-paid': User,
};

const NODE_COLORS = ['primary', 'mint', 'violet', 'gold', 'coral'] as const;

export function PipelineView({ nodes }: { nodes: StreamNode[] }) {
  return (
    <Track>
      {nodes.map((node, index) => {
        const Icon = ICONS[node.key] ?? FileText;
        const color = NODE_COLORS[index % NODE_COLORS.length] ?? 'primary';
        const nextNode = nodes[index + 1];

        return (
          <NodeGroup key={node.key}>
            <NodeColumn>
              <NodeCircle $status={node.status} $color={color}>
                <Icon size={20} strokeWidth={2} />
              </NodeCircle>
              <NodeLabel>{node.label}</NodeLabel>
              <NodeDetail title={node.detail}>{node.detail}</NodeDetail>
            </NodeColumn>
            {nextNode && (
              <Connector
                $filled={node.status === 'complete'}
                $pulsing={nextNode.status === 'active'}
              />
            )}
          </NodeGroup>
        );
      })}
    </Track>
  );
}

const travel = keyframes`
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
`;

const Track = styled.div`
  display: flex;
  align-items: flex-start;
  overflow-x: auto;
  padding: 8px 4px 16px;

  @media (max-width: 900px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const NodeGroup = styled.div`
  display: flex;
  align-items: flex-start;
  flex: 1;
  min-width: 108px;

  @media (max-width: 900px) {
    flex-direction: column;
    min-width: 0;
  }
`;

const NodeColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 108px;
  text-align: center;
  flex-shrink: 0;

  @media (max-width: 900px) {
    flex-direction: row;
    width: auto;
    text-align: left;
    padding: 8px 0;
  }
`;

const NodeCircle = styled.div<{ $status: NodeStatus; $color: (typeof NODE_COLORS)[number] }>`
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: ${(props) =>
    props.$status === 'waiting' || props.$status === 'unavailable'
      ? props.theme.colors.textMuted
      : props.$status === 'failed'
        ? props.theme.colors.error
        : '#fff'};
  background: ${(props) =>
    props.$status === 'complete' || props.$status === 'active'
      ? props.theme.colors[props.$color]
      : props.$status === 'failed'
        ? `${props.theme.colors.error}1a`
        : props.theme.colors.surfaceMuted};
  border: ${(props) =>
    props.$status === 'unavailable'
      ? `2px dashed ${props.theme.colors.border}`
      : props.$status === 'failed'
        ? `2px solid ${props.theme.colors.error}`
        : '2px solid transparent'};
`;

const NodeLabel = styled.span`
  font-size: 0.8rem;
  font-weight: 600;
  color: ${(props) => props.theme.colors.text};
`;

const NodeDetail = styled.span`
  font-size: 0.72rem;
  color: ${(props) => props.theme.colors.textMuted};
  max-width: 108px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 900px) {
    max-width: none;
  }
`;

const Connector = styled.div<{ $filled: boolean; $pulsing: boolean }>`
  position: relative;
  overflow: hidden;
  height: 2px;
  flex: 1;
  margin-top: 22px;
  background: ${(props) => (props.$filled ? props.theme.colors.primary : props.theme.colors.border)};

  &::after {
    content: '';
    display: ${(props) => (props.$pulsing ? 'block' : 'none')};
    position: absolute;
    inset: 0;
    width: 40%;
    background: ${(props) => props.theme.colors.primary};
    animation: ${travel} 1.2s ease-in-out infinite;
  }

  @media (max-width: 900px) {
    width: 2px;
    height: 20px;
    margin: 0 0 0 21px;
  }
`;
