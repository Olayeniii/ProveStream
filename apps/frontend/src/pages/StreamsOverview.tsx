import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import { AppShell } from '../components/AppShell.js';
import { FlowDiagram } from '../components/pipeline/FlowDiagram.js';
import { PipelineView } from '../components/pipeline/PipelineView.js';
import { RewardDetailsPanel } from '../components/pipeline/RewardDetailsPanel.js';
import { RewardMetricsStrip } from '../components/pipeline/RewardMetricsStrip.js';
import { RiskAnalysisPanel } from '../components/pipeline/RiskAnalysisPanel.js';
import { StreamActionsPanel } from '../components/pipeline/StreamActionsPanel.js';
import { StreamCard } from '../components/pipeline/StreamCard.js';
import { StreamOrb } from '../components/pipeline/StreamOrb.js';
import { StreamTimeline } from '../components/pipeline/StreamTimeline.js';
import { useLiveStream } from '../hooks/useLiveStream.js';
import type { AppEnv } from '../env.js';
import type { ApiClient, AttestationRecord, PolicySummary } from '../lib/api.js';
import { buildStreams, getOrbState } from '../lib/streams.js';
import type { Payment, RiskAnalysis, SignatureVerification } from '@provenance-streams/protocol';

const LIVE_KINDS = ['attestation', 'payment', 'risk-analysis', 'signature-verification'] as const;

export function StreamsOverview({ env, api }: { env: AppEnv; api: ApiClient }) {
  const [attestations, setAttestations] = useState<AttestationRecord[]>([]);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [riskAnalyses, setRiskAnalyses] = useState<RiskAnalysis[]>([]);
  const [signatureVerifications, setSignatureVerifications] = useState<SignatureVerification[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  function refresh() {
    api
      .listAttestations()
      .then(setAttestations)
      .catch(() => undefined);
    api
      .listPolicies()
      .then(setPolicies)
      .catch(() => undefined);
    api
      .listPayments()
      .then(setPayments)
      .catch(() => undefined);
    api
      .listRiskAnalyses()
      .then(setRiskAnalyses)
      .catch(() => undefined);
    api
      .listSignatureVerifications()
      .then(setSignatureVerifications)
      .catch(() => undefined);
  }

  useEffect(refresh, [api]);
  // `useLiveStream` captures `refresh` via a ref internally, so it doesn't
  // need a stable reference — a plain function redefined each render is fine.
  useLiveStream(`${env.backendUrl}/api/events`, LIVE_KINDS, refresh);

  const streams = useMemo(
    () => buildStreams(attestations, policies, payments, riskAnalyses, signatureVerifications),
    [attestations, policies, payments, riskAnalyses, signatureVerifications],
  );

  const selected = streams.find((stream) => stream.id === selectedId) ?? streams[0];

  return (
    <AppShell
      title="Streams"
      subtitle="Following the journey from attestation to reward"
      env={env}
      api={api}
    >
      {streams.length === 0 ? (
        <Empty>No streams yet. Submit an attestation from the Auditor page to start one.</Empty>
      ) : (
        <>
          {selected && (
            <DetailCard>
              <DetailHeader>
                <StreamOrb size={64} {...getOrbState(selected)} />
                <DetailTitle>Attestation #{selected.id}</DetailTitle>
              </DetailHeader>
              <PipelineView nodes={selected.nodes} />
              <RewardMetricsStrip stream={selected} />
            </DetailCard>
          )}

          {selected && (
            <DetailGrid>
              <TimelineCard>
                <TimelineSplit>
                  <TimelineColumn>
                    <PanelTitle>Stream Timeline</PanelTitle>
                    <StreamTimeline nodes={selected.nodes} />
                  </TimelineColumn>
                  <FlowBox>
                    <FlowDiagram />
                  </FlowBox>
                </TimelineSplit>
              </TimelineCard>
              <SidePanels>
                <RewardDetailsPanel stream={selected} />
                <RiskAnalysisPanel stream={selected} />
                <StreamActionsPanel stream={selected} env={env} />
              </SidePanels>
            </DetailGrid>
          )}

          <Section>
            <SectionTitle>Recent Streams</SectionTitle>
            <Grid>
              {streams.map((stream) => (
                <StreamCard
                  key={stream.id}
                  stream={stream}
                  selected={stream.id === selected?.id}
                  onClick={() => setSelectedId(stream.id)}
                />
              ))}
            </Grid>
          </Section>
        </>
      )}
    </AppShell>
  );
}

const Empty = styled.p`
  color: ${(props) => props.theme.colors.textMuted};
`;

const DetailCard = styled.div`
  padding: 24px;
  border-radius: ${(props) => props.theme.radius.card};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surface};
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const DetailHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
`;

const DetailTitle = styled.h2`
  margin: 0;
  font-size: 1.15rem;
  color: ${(props) => props.theme.colors.text};
`;

const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
`;

const TimelineCard = styled.div`
  padding: 24px;
  border-radius: ${(props) => props.theme.radius.card};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surface};
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const PanelTitle = styled.h3`
  margin: 0 0 12px;
  font-size: 1rem;
  color: ${(props) => props.theme.colors.text};
`;

const TimelineSplit = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: start;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const TimelineColumn = styled.div`
  min-width: 0;
`;

const FlowBox = styled.div`
  padding: 16px;
  border-radius: ${(props) => props.theme.radius.card};
  border: 1px solid ${(props) => props.theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const SidePanels = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-size: 1rem;
  color: ${(props) => props.theme.colors.text};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
`;
