import {
  BadgeCheck,
  Bot,
  CheckCircle2,
  FileCheck2,
  Landmark,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import styled from 'styled-components';

import { AppShell } from '../components/AppShell.js';
import type { AppEnv } from '../env.js';
import type { ApiClient } from '../lib/api.js';

const STEPS: { icon: typeof FileCheck2; title: string; body: string; tone?: 'attention' }[] = [
  {
    icon: FileCheck2,
    title: 'An auditor submits an attestation',
    body: "A field auditor signs in with their wallet and records that a supplier met a requirement, for example that a coffee shipment is certified organic. This is a real, signed transaction on Arc's blockchain, so it can't be faked or edited afterward.",
  },
  {
    icon: BadgeCheck,
    title: "It's checked against a reward policy",
    body: 'The system looks up the reward policy the auditor referenced. If it exists and is active, the supplier is eligible for a payout, with the amount and credential type set by whoever configured the policy.',
  },
  {
    icon: Bot,
    title: 'AI reviews the evidence (informational)',
    body: 'If the auditor included evidence text, an AI model reads it and flags anything that looks inconsistent or suspicious, with a plain-language explanation. A very high-risk score also pauses the payout for a human to look at, alongside the automatic check below.',
  },
  {
    icon: ShieldCheck,
    title: 'The signature and fraud checks run',
    body: "The system independently verifies the attestation was really signed by the auditor it claims, not just trusting what it's told. It also checks the pattern of recent activity (repeated claims, unusual frequency) and holds the payout for review if something looks off.",
  },
  {
    icon: Landmark,
    title: 'The treasury approves and pays',
    body: 'Once everything checks out, the system automatically sends the reward, real USDC, from the treasury wallet to the supplier. No human has to click "approve" for a normal, clean submission.',
  },
  {
    icon: Wallet,
    title: 'The supplier receives the funds',
    body: "The payment lands in the supplier's own wallet, on the same chain or bridged to another chain if they've registered a different wallet elsewhere. They can see it update in real time.",
  },
  {
    icon: CheckCircle2,
    title: 'If something looks wrong',
    body: 'A held payout shows up for an admin to review, with the reason attached (AI risk score, unusual pattern, etc). An admin can approve it (releasing the same payment automatically) or reject it, which leaves it unpaid.',
    tone: 'attention',
  },
];

export function HowItWorksPage({ env, api }: { env: AppEnv; api: ApiClient }) {
  return (
    <AppShell
      title="How it works"
      subtitle="The reward pipeline, in plain language"
      env={env}
      api={api}
    >
      <Intro>
        This app pays suppliers automatically once their work is verified, so no one has to manually
        process a payout for the normal case. Here&apos;s what actually happens behind the scenes,
        step by step.
      </Intro>

      <StepList>
        {STEPS.map((step, index) => (
          <StepRow key={step.title}>
            <StepRail>
              <StepIcon $tone={step.tone}>
                <step.icon size={16} strokeWidth={2} />
              </StepIcon>
              {index < STEPS.length - 1 && <StepConnector $dashed={step.tone === 'attention'} />}
            </StepRail>
            <StepBody>
              <StepTitle>{step.title}</StepTitle>
              <StepText>{step.body}</StepText>
            </StepBody>
          </StepRow>
        ))}
      </StepList>

      <Note>
        Every number and status you see elsewhere in this app is real, pulled live from the
        blockchain, the treasury, and whichever AI service answered. Nothing here is a mockup or
        placeholder data.
      </Note>
    </AppShell>
  );
}

const Intro = styled.p`
  margin: 0 0 8px;
  font-size: 0.95rem;
  color: ${(props) => props.theme.colors.textMuted};
  max-width: 640px;
`;

const StepList = styled.div`
  display: flex;
  flex-direction: column;
`;

const StepRow = styled.div`
  display: flex;
  gap: 20px;
`;

const StepRail = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
`;

const StepConnector = styled.div<{ $dashed?: boolean }>`
  width: 2px;
  flex: 1;
  min-height: 24px;
  margin: 4px 0;
  background: ${(props) => (props.$dashed ? 'transparent' : props.theme.colors.border)};
  border-left: ${(props) => (props.$dashed ? `2px dashed ${props.theme.colors.border}` : 'none')};
`;

const StepIcon = styled.div<{ $tone?: 'attention' | undefined }>`
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) =>
    props.$tone === 'attention'
      ? `${props.theme.colors.coral}1a`
      : `${props.theme.colors.primary}1a`};
  color: ${(props) =>
    props.$tone === 'attention' ? props.theme.colors.coral : props.theme.colors.primary};
`;

const StepBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 28px;
`;

const StepTitle = styled.h3`
  margin: 0;
  padding-top: 6px;
  font-size: 0.95rem;
  color: ${(props) => props.theme.colors.text};
`;

const StepText = styled.p`
  margin: 0;
  max-width: 65ch;
  font-size: 0.85rem;
  line-height: 1.5;
  color: ${(props) => props.theme.colors.textMuted};
`;

const Note = styled.p`
  margin: 8px 0 0;
  font-size: 0.8rem;
  color: ${(props) => props.theme.colors.textMuted};
`;
