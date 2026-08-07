import { Bot, RefreshCw, ShieldCheck, Target, User, Wallet } from 'lucide-react';
import styled from 'styled-components';

const NODES = {
  auditor: { label: 'Auditor', icon: User, color: 'primary' as const },
  registry: { label: 'Registry', icon: ShieldCheck, color: 'mint' as const },
  policy: { label: 'Policy', icon: Target, color: 'violet' as const },
  treasury: { label: 'Treasury', icon: Wallet, color: 'primary' as const },
  aiAgent: { label: 'AI Agent', icon: Bot, color: 'gold' as const },
  settlement: { label: 'Settlement', icon: RefreshCw, color: 'primary' as const },
  supplier: { label: 'Supplier', icon: User, color: 'mint' as const },
};

/** A static diagram of how the pieces of the system relate — architecture, not per-stream data. */
export function FlowDiagram() {
  return (
    <Diagram>
      <Node node={NODES.auditor} style={{ gridColumn: 1, gridRow: 1 }} />
      <HArrow style={{ gridColumn: 2, gridRow: 1 }} />
      <Node node={NODES.registry} style={{ gridColumn: 3, gridRow: 1 }} />
      <HArrow style={{ gridColumn: 4, gridRow: 1 }} />
      <Node node={NODES.policy} style={{ gridColumn: 5, gridRow: 1 }} />

      <VArrow style={{ gridColumn: 1, gridRow: 2 }} />
      <VArrow style={{ gridColumn: 5, gridRow: 2 }} />

      <Node node={NODES.treasury} style={{ gridColumn: 1, gridRow: 3 }} />
      <HArrow reverse style={{ gridColumn: 2, gridRow: 3 }} />
      <Node node={NODES.aiAgent} style={{ gridColumn: 3, gridRow: 3 }} />
      <HArrow style={{ gridColumn: 4, gridRow: 3 }} />
      <Node node={NODES.settlement} style={{ gridColumn: 5, gridRow: 3 }} />

      <VArrow style={{ gridColumn: 1, gridRow: 4 }} />
      <VArrow dashed style={{ gridColumn: 5, gridRow: 4 }} />

      <SupplierCell style={{ gridColumn: '1 / 6', gridRow: 5 }}>
        <Node node={NODES.supplier} />
      </SupplierCell>
    </Diagram>
  );
}

function Node({
  node,
  style,
}: {
  node: (typeof NODES)[keyof typeof NODES];
  style?: React.CSSProperties;
}) {
  const Icon = node.icon;
  return (
    <NodeColumn style={style}>
      <NodeCircle $color={node.color}>
        <Icon size={16} strokeWidth={2} />
      </NodeCircle>
      <NodeLabel>{node.label}</NodeLabel>
    </NodeColumn>
  );
}

const Diagram = styled.div`
  display: grid;
  grid-template-columns: 72px 28px 72px 28px 72px;
  align-items: center;
  justify-content: center;
  justify-items: center;
  row-gap: 4px;
  padding: 12px 8px;
`;

const NodeColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
`;

const NodeCircle = styled.div<{ $color: 'primary' | 'mint' | 'violet' | 'gold' }>`
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => props.theme.colors.primaryText};
  background: ${(props) => props.theme.colors[props.$color]};
`;

const NodeLabel = styled.span`
  font-size: 0.68rem;
  color: ${(props) => props.theme.colors.textMuted};
  text-align: center;
  white-space: nowrap;
`;

const SupplierCell = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 4px;
`;

const HArrow = styled.div<{ reverse?: boolean }>`
  width: 100%;
  height: 2px;
  background: ${(props) => props.theme.colors.border};
  position: relative;
  align-self: center;
  margin-top: -20px;

  &::after {
    content: '';
    position: absolute;
    top: 50%;
    ${(props) => (props.reverse ? 'left: 0;' : 'right: 0;')}
    transform: translateY(-50%) ${(props) => (props.reverse ? 'rotate(180deg)' : '')};
    border: 4px solid transparent;
    border-${(props) => (props.reverse ? 'right' : 'left')}-color: ${(props) => props.theme.colors.border};
  }
`;

const VArrow = styled.div<{ dashed?: boolean }>`
  width: 2px;
  height: 24px;
  background: ${(props) => (props.dashed ? 'transparent' : props.theme.colors.border)};
  border-left: ${(props) => (props.dashed ? `2px dashed ${props.theme.colors.border}` : 'none')};
`;
