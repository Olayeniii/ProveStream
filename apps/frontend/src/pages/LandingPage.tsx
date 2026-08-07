import { arcTestnet, hardhatLocal } from '@provenance-streams/protocol';
import { BookOpen, Rocket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

import logo from '../assets/logo.png';
import { StreamOrb } from '../components/pipeline/StreamOrb.js';
import type { AppEnv } from '../env.js';
import type { ApiClient, AttestationRecord, PolicySummary } from '../lib/api.js';
import { formatAmount } from '../lib/format.js';

function networkLabel(chainId: number): string {
  if (chainId === arcTestnet.id) {
    return 'Arc Testnet';
  }
  if (chainId === hardhatLocal.id) {
    return 'Hardhat Local';
  }
  return `Chain ${chainId}`;
}

export function LandingPage({ env, api }: { env: AppEnv; api: ApiClient }) {
  const [attestations, setAttestations] = useState<AttestationRecord[]>([]);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [treasury, setTreasury] = useState<string | undefined>(undefined);
  const [suppliersPaid, setSuppliersPaid] = useState<number | undefined>(undefined);

  useEffect(() => {
    api
      .listAttestations()
      .then(setAttestations)
      .catch(() => undefined);
    api
      .listPolicies()
      .then(setPolicies)
      .catch(() => undefined);
    api
      .getTreasuryBalance()
      .then((balance) => setTreasury(formatAmount(balance.amount, 2)))
      .catch(() => undefined);
    api
      .listPayments()
      .then((payments) => {
        const suppliers = new Set(
          payments
            .filter((payment) => payment.status === 'complete')
            .map((payment) => payment.supplier),
        );
        setSuppliersPaid(suppliers.size);
      })
      .catch(() => undefined);
  }, [api]);

  const stats = [
    { label: 'Policies', value: policies.length.toString() },
    { label: 'Attestations', value: attestations.length.toString() },
    {
      label: 'Suppliers Paid',
      value: suppliersPaid !== undefined ? suppliersPaid.toString() : '—',
    },
    { label: 'Network', value: networkLabel(env.chainId) },
    { label: 'Treasury', value: treasury !== undefined ? `${treasury} USDC` : '—' },
  ];

  return (
    <Page>
      <NavBar>
        <Brand>
          <BrandLogo src={logo} alt="Provenance Streams" />
          <BrandText>
            Provenance<Accent>Streams</Accent>
          </BrandText>
        </Brand>
        <NavLinks>
          <NavAnchorLink to="/how-it-works">How it works</NavAnchorLink>
        </NavLinks>
        <LaunchButtonSmall href="#/streams" target="_blank" rel="noopener noreferrer">
          Launch App
        </LaunchButtonSmall>
      </NavBar>

      <Hero>
        <StreamOrb
          size={120}
          verification={attestations.length > 0 ? 100 : 0}
          confidence={policies.length > 0 ? 100 : 0}
          rewardSettled={suppliersPaid !== undefined && suppliersPaid > 0}
        />

        <Headline>
          Provenance you can <HAccent1>attest</HAccent1>, <HAccent2>verify</HAccent2>, and{' '}
          <HAccent3>settle</HAccent3>, autonomously.
        </Headline>

        <Tagline>
          An autonomous USDC settlement engine on Circle&apos;s Arc chain. An auditor attests, AI
          and on-chain checks review it, and the supplier gets paid. No human in the loop for the
          normal case, real money moving on a real chain.
        </Tagline>

        <CtaRow>
          <PrimaryCta href="#/streams" target="_blank" rel="noopener noreferrer">
            <Rocket size={16} />
            Launch App
          </PrimaryCta>
          <SecondaryCta to="/how-it-works">
            <BookOpen size={16} />
            Read the docs
          </SecondaryCta>
        </CtaRow>
      </Hero>

      <StatsStrip>
        {stats.map((stat) => (
          <StatItem key={stat.label}>
            {stat.label === 'Network' && <LiveDot title="Live" />}
            <StatItemLabel>{stat.label}</StatItemLabel>
            <StatItemValue>{stat.value}</StatItemValue>
          </StatItem>
        ))}
      </StatsStrip>
    </Page>
  );
}

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${(props) => props.theme.colors.background};
`;

const NavBar = styled.nav`
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 32px;
  border-bottom: 1px solid ${(props) => props.theme.colors.border};
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const BrandLogo = styled.img`
  width: 28px;
  height: 28px;
  border-radius: 8px;
`;

const BrandText = styled.span`
  font-weight: 700;
  font-size: 1rem;
  color: ${(props) => props.theme.colors.text};
`;

const Accent = styled.span`
  color: ${(props) => props.theme.colors.primary};
`;

const NavLinks = styled.div`
  display: flex;
  gap: 20px;
  flex: 1;
`;

const NavAnchorLink = styled(Link)`
  font-size: 0.88rem;
  color: ${(props) => props.theme.colors.textMuted};
  text-decoration: none;

  &:hover {
    color: ${(props) => props.theme.colors.text};
  }
`;

const LaunchButtonSmall = styled.a`
  padding: 8px 16px;
  border-radius: ${(props) => props.theme.radius.pill};
  background: ${(props) => props.theme.colors.primary};
  color: ${(props) => props.theme.colors.primaryText};
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  transition: transform 160ms ease-out;

  &:active {
    transform: scale(0.97);
  }
`;

const Hero = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  text-align: center;
  padding: 64px 24px;
`;

const Headline = styled.h1`
  margin: 0;
  max-width: 720px;
  font-family: ${(props) => props.theme.displayFontFamily};
  font-size: clamp(2.1rem, 4.8vw, 3.2rem);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: ${(props) => props.theme.colors.text};
`;

const HAccent1 = styled.span`
  color: ${(props) => props.theme.colors.primary};
`;

const HAccent2 = styled.span`
  color: ${(props) => props.theme.colors.mint};
`;

const HAccent3 = styled.span`
  color: ${(props) => props.theme.colors.violet};
`;

const Tagline = styled.p`
  margin: 0;
  max-width: 600px;
  font-size: 1.02rem;
  line-height: 1.6;
  color: ${(props) => props.theme.colors.textMuted};
`;

const CtaRow = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 8px;
`;

const PrimaryCta = styled.a`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 26px;
  border-radius: ${(props) => props.theme.radius.pill};
  background: ${(props) => props.theme.colors.primary};
  color: ${(props) => props.theme.colors.primaryText};
  font-size: 0.95rem;
  font-weight: 700;
  text-decoration: none;
  transition: transform 160ms ease-out;

  &:active {
    transform: scale(0.97);
  }
`;

const SecondaryCta = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 26px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: transparent;
  color: ${(props) => props.theme.colors.text};
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: none;
  transition: transform 160ms ease-out;

  &:active {
    transform: scale(0.97);
  }
`;

const StatsStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  padding: 0 24px 56px;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const StatItem = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 20px;
  border-left: 1px solid ${(props) => props.theme.colors.border};

  &:first-child {
    border-left: none;
  }

  @media (max-width: 640px) {
    border-left: none;
    border-top: 1px solid ${(props) => props.theme.colors.border};
    justify-content: center;
    padding: 10px 0;

    &:first-child {
      border-top: none;
    }
  }
`;

const LiveDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: ${(props) => props.theme.colors.mint};
  align-self: center;
`;

const StatItemLabel = styled.span`
  font-size: 0.78rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const StatItemValue = styled.span`
  font-size: 0.9rem;
  font-weight: 600;
  font-family: ${(props) => props.theme.monoFontFamily};
  color: ${(props) => props.theme.colors.text};
`;
