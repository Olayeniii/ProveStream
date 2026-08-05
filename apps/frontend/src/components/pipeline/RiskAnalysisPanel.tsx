import { Cpu } from 'lucide-react';
import styled from 'styled-components';

import type { Stream } from '../../lib/streams.js';

function riskLabel(score: number): { label: string; tone: 'positive' | 'warning' | 'negative' } {
  if (score < 30) {
    return { label: 'Low Risk', tone: 'positive' };
  }
  if (score < 70) {
    return { label: 'Medium Risk', tone: 'warning' };
  }
  return { label: 'High Risk', tone: 'negative' };
}

export function RiskAnalysisPanel({ stream }: { stream: Stream }) {
  const node = stream.nodes.find((candidate) => candidate.key === 'ai-risk-analysis');

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Cpu size={16} /> AI Risk Analysis
        </PanelTitle>
        <StatusPill $status={node?.status ?? 'unavailable'}>
          {node?.status === 'complete'
            ? 'Completed'
            : node?.status === 'active'
              ? 'Analyzing'
              : node?.status === 'failed'
                ? 'Failed'
                : 'Unavailable'}
        </StatusPill>
      </PanelHeader>

      {node?.status === 'complete' && node.score !== undefined ? (
        <Complete
          score={node.score}
          confidence={node.confidence}
          summary={node.detail}
          provider={node.provider}
        />
      ) : node?.status === 'active' ? (
        <Empty>Analyzing submitted evidence…</Empty>
      ) : node?.status === 'failed' ? (
        <Empty>{node.detail ?? 'Risk analysis failed.'}</Empty>
      ) : (
        <Empty>
          Risk analysis isn&apos;t wired up yet — no fraud-scoring service is configured. This panel
          will populate once that lands.
        </Empty>
      )}
    </Panel>
  );
}

function Complete({
  score,
  confidence,
  summary,
  provider,
}: {
  score: number;
  confidence: number | undefined;
  summary: string | undefined;
  provider: string | undefined;
}) {
  const risk = riskLabel(score);

  return (
    <>
      <GaugeRow>
        <Gauge $percent={score} $tone={risk.tone}>
          <GaugeValue>{score}%</GaugeValue>
        </Gauge>
        <GaugeCaption $tone={risk.tone}>{risk.label}</GaugeCaption>
        {provider && <ProviderTag>Scored by {provider}</ProviderTag>}
      </GaugeRow>
      {summary && <Summary>{summary}</Summary>}
      {confidence !== undefined && (
        <ConfidenceBlock>
          <ConfidenceRow>
            <span>Confidence Score</span>
            <strong>{confidence}%</strong>
          </ConfidenceRow>
          <BarTrack>
            <BarFill $percent={confidence} />
          </BarTrack>
        </ConfidenceBlock>
      )}
    </>
  );
}

const Panel = styled.div`
  padding: 20px;
  border-radius: ${(props) => props.theme.radius.card};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surface};
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const PanelTitle = styled.h3`
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  color: ${(props) => props.theme.colors.text};
`;

const StatusPill = styled.span<{ $status: string }>`
  padding: 3px 10px;
  border-radius: ${(props) => props.theme.radius.pill};
  font-size: 0.72rem;
  font-weight: 600;
  color: ${(props) =>
    props.$status === 'complete' ? props.theme.colors.primary : props.theme.colors.textMuted};
  background: ${(props) =>
    props.$status === 'complete'
      ? `${props.theme.colors.primary}1a`
      : props.theme.colors.surfaceMuted};
`;

const Empty = styled.p`
  margin: 0;
  font-size: 0.85rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const GaugeRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
`;

const Gauge = styled.div<{ $percent: number; $tone: 'positive' | 'warning' | 'negative' }>`
  width: 108px;
  height: 108px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: conic-gradient(
    ${(props) =>
      props.$tone === 'positive'
        ? props.theme.colors.mint
        : props.$tone === 'warning'
          ? props.theme.colors.gold
          : props.theme.colors.coral}
      ${(props) => props.$percent * 3.6}deg,
    ${(props) => props.theme.colors.surfaceMuted} 0deg
  );

  &::before {
    content: '';
    position: absolute;
  }
`;

const GaugeValue = styled.span`
  width: 84px;
  height: 84px;
  border-radius: 999px;
  background: ${(props) => props.theme.colors.surface};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  font-weight: 700;
  color: ${(props) => props.theme.colors.text};
`;

const GaugeCaption = styled.span<{ $tone: 'positive' | 'warning' | 'negative' }>`
  font-size: 0.85rem;
  font-weight: 600;
  color: ${(props) =>
    props.$tone === 'positive' ? '#166534' : props.$tone === 'warning' ? '#92400E' : '#9A3412'};
`;

const ProviderTag = styled.span`
  font-size: 0.72rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const Summary = styled.p`
  margin: 0;
  font-size: 0.82rem;
  color: ${(props) => props.theme.colors.textMuted};
  text-align: center;
`;

const ConfidenceBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ConfidenceRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.82rem;
  color: ${(props) => props.theme.colors.textMuted};

  strong {
    color: ${(props) => props.theme.colors.text};
  }
`;

const BarTrack = styled.div`
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: ${(props) => props.theme.colors.surfaceMuted};
  overflow: hidden;
`;

const BarFill = styled.div<{ $percent: number }>`
  width: ${(props) => props.$percent}%;
  height: 100%;
  background: ${(props) => props.theme.colors.primary};
`;
