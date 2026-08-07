import { Cpu } from 'lucide-react';
import styled, { useTheme } from 'styled-components';

import type { Stream, StreamTone } from '../../lib/streams.js';
import { getToneColor } from '../../lib/tone.js';

type RiskTone = Extract<StreamTone, 'positive' | 'warning' | 'attention'>;

const GAUGE_R = 40;
const GAUGE_CIRC = 2 * Math.PI * GAUGE_R;

/** High risk is coral/`attention` — needs review, same design-language rule as elsewhere: not a hard failure, since a flagged payout can still be approved. */
function riskLabel(score: number): { label: string; tone: RiskTone } {
  if (score < 30) {
    return { label: 'Low Risk', tone: 'positive' };
  }
  if (score < 70) {
    return { label: 'Medium Risk', tone: 'warning' };
  }
  return { label: 'High Risk', tone: 'attention' };
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
        <Complete score={node.score} confidence={node.confidence} summary={node.detail} />
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
}: {
  score: number;
  confidence: number | undefined;
  summary: string | undefined;
}) {
  const theme = useTheme();
  const risk = riskLabel(score);
  const ringColor =
    risk.tone === 'positive'
      ? theme.colors.mint
      : risk.tone === 'warning'
        ? theme.colors.gold
        : theme.colors.coral;

  return (
    <>
      <GaugeRow>
        {/* Same round-linecap ring arc as StreamOrb, for one consistent gauge
            language across the app instead of a second conic-gradient trick. */}
        <svg viewBox="0 0 100 100" width="112" height="112">
          <circle
            cx={50}
            cy={50}
            r={GAUGE_R}
            fill="none"
            stroke={theme.colors.surfaceMuted}
            strokeWidth={8}
          />
          <circle
            cx={50}
            cy={50}
            r={GAUGE_R}
            fill="none"
            stroke={ringColor}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={GAUGE_CIRC}
            strokeDashoffset={GAUGE_CIRC * (1 - score / 100)}
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dashoffset 600ms ease' }}
          />
          <text
            x={50}
            y={46}
            textAnchor="middle"
            fontSize={20}
            fontWeight={700}
            fill={theme.colors.text}
          >
            {score}
          </text>
          <text x={50} y={62} textAnchor="middle" fontSize={9} fill={theme.colors.textMuted}>
            / 100
          </text>
        </svg>
        <GaugeCaption $tone={risk.tone}>{risk.label}</GaugeCaption>
      </GaugeRow>
      {summary && <Summary>{summary}</Summary>}
      {confidence !== undefined && (
        <ConfidenceRow>
          <span>Model confidence</span>
          <strong>{confidence}%</strong>
        </ConfidenceRow>
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

const GaugeCaption = styled.span<{ $tone: RiskTone }>`
  font-size: 0.85rem;
  font-weight: 600;
  color: ${(props) => getToneColor(props.theme, props.$tone).text};
`;

const Summary = styled.p`
  margin: 0;
  font-size: 0.82rem;
  color: ${(props) => props.theme.colors.textMuted};
  text-align: center;
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
