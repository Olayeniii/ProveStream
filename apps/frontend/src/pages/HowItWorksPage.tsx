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

const STEPS = [
  {
    icon: FileCheck2,
    title: '1. An auditor submits an attestation',
    body: "A field auditor signs in with their wallet and records that a supplier met a requirement, for example that a coffee shipment is certified organic. This is a real, signed transaction on Arc's blockchain, so it can't be faked or edited afterward.",
  },
  {
    icon: BadgeCheck,
    title: "2. It's checked against a reward policy",
    body: 'The system looks up the reward policy the auditor referenced. If it exists and is active, the supplier is eligible for a payout, with the amount and credential type set by whoever configured the policy.',
  },
  {
    icon: Bot,
    title: '3. AI reviews the evidence (informational)',
    body: 'If the auditor included evidence text, an AI model reads it and flags anything that looks inconsistent or suspicious, with a plain-language explanation. A very high-risk score also pauses the payout for a human to look at, alongside the automatic check below.',
  },
  {
    icon: ShieldCheck,
    title: '4. The signature and fraud checks run',
    body: "The system independently verifies the attestation was really signed by the auditor it claims, not just trusting what it's told. It also checks the pattern of recent activity (repeated claims, unusual frequency) and holds the payout for review if something looks off.",
  },
  {
    icon: Landmark,
    title: '5. The treasury approves and pays',
    body: 'Once everything checks out, the system automatically sends the reward, real USDC, from the treasury wallet to the supplier. No human has to click "approve" for a normal, clean submission.',
  },
  {
    icon: Wallet,
    title: '6. The supplier receives the funds',
    body: "The payment lands in the supplier's own wallet, on the same chain or bridged to another chain if they've registered a different wallet elsewhere. They can see it update in real time.",
  },
  {
    icon: CheckCircle2,
    title: 'If something looks wrong',
    body: 'A held payout shows up for an admin to review, with the reason attached (AI risk score, unusual pattern, etc). An admin can approve it (releasing the same payment automatically) or reject it, which leaves it unpaid.',
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
        This app pays suppliers automatically once their work is verified, so no one has to
        manually process a payout for the normal case. Here&apos;s what actually happens behind
        the scenes, step by step.
      </Intro>

      <StepList>
        {STEPS.map((step) => (
          <StepCard key={step.title}>
            <StepIcon>
              <step.icon size={20} />
            </StepIcon>
            <StepBody>
              <StepTitle>{step.title}</StepTitle>
              <StepText>{step.body}</StepText>
            </StepBody>
          </StepCard>
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
  gap: 12px;
`;

const StepCard = styled.div`
  display: flex;
  gap: 16px;
  padding: ${(props) => props.theme.spacing.cardPadding};
  background: ${(props) => props.theme.colors.surface};
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: ${(props) => props.theme.radius.card};
`;

const StepIcon = styled.div`
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => props.theme.colors.primary}1a;
  color: ${(props) => props.theme.colors.primary};
`;

const StepBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StepTitle = styled.h3`
  margin: 0;
  font-size: 0.95rem;
  color: ${(props) => props.theme.colors.text};
`;

const StepText = styled.p`
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: ${(props) => props.theme.colors.textMuted};
`;

const Note = styled.p`
  margin: 8px 0 0;
  font-size: 0.8rem;
  color: ${(props) => props.theme.colors.textMuted};
`;
