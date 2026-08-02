import { Cpu } from 'lucide-react';
import styled from 'styled-components';

export function RiskAnalysisPanel() {
  return (
    <Panel>
      <PanelTitle>
        <Cpu size={16} /> AI Risk Analysis
      </PanelTitle>
      <Empty>
        Risk analysis isn&apos;t wired up yet — no fraud-scoring service is configured. This panel
        will populate once that lands in a future milestone.
      </Empty>
    </Panel>
  );
}

const Panel = styled.div`
  padding: 20px;
  border-radius: ${(props) => props.theme.radius.card};
  border: 1px dashed ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surfaceMuted};
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const PanelTitle = styled.h3`
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const Empty = styled.p`
  margin: 0;
  font-size: 0.85rem;
  color: ${(props) => props.theme.colors.textMuted};
`;
