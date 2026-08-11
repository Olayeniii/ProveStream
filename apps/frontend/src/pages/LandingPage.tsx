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

// lucide-react deliberately ships no brand marks, so the GitHub octocat is
// hand-drawn here from its official single-path glyph — the one brand icon
// this footer needs.
function GithubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.207 11.387.6.11.793-.26.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.419-1.305.762-1.605-2.665-.303-5.467-1.332-5.467-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.5 11.5 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.807 5.624-5.479 5.921.43.372.814 1.103.814 2.222v3.293c0 .32.192.694.801.576C20.566 21.797 24 17.298 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

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
        <HeroVisual>
          <BackgroundRings aria-hidden="true">
            <svg viewBox="0 0 100 100" width="100%" height="100%">
              <circle cx={50} cy={50} r={30} />
              <circle cx={50} cy={50} r={40} />
              <circle cx={50} cy={50} r={49} />
            </svg>
          </BackgroundRings>
          <StreamOrb
            size={220}
            verification={attestations.length > 0 ? 100 : 0}
            confidence={policies.length > 0 ? 100 : 0}
            rewardSettled={suppliersPaid !== undefined && suppliersPaid > 0}
          />
        </HeroVisual>

        <HeroCopy>
          <Headline>
            Provenance you can <HAccent>attest</HAccent>, <HAccent>verify</HAccent>, and{' '}
            <HAccent>settle</HAccent>, autonomously.
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
        </HeroCopy>
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

      <PageFooter>
        <FooterBottom>
          <span>© {new Date().getFullYear()} Provenance Streams</span>
          <FooterIconLink
            href="https://github.com/Olayeniii/ProveStream"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
          >
            <GithubMark />
          </FooterIconLink>
          <PoweredBy>
            Powered by
            <ArcLogo
              src="https://cdn.prod.website-files.com/685311a976e7c248b5dfde95/688f6e47d217527a8db50637_logo.webp"
              alt="Arc"
            />
          </PoweredBy>
        </FooterBottom>
      </PageFooter>
    </Page>
  );
}

const Page = styled.div`
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

  @media (max-width: 480px) {
    gap: 12px;
    padding: 14px 16px;
  }
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
`;

const BrandLogo = styled.img`
  width: 28px;
  height: 28px;
  border-radius: 8px;

  @media (max-width: 480px) {
    width: 22px;
    height: 22px;
  }
`;

const BrandText = styled.span`
  font-weight: 700;
  font-size: 1rem;
  color: ${(props) => props.theme.colors.text};

  @media (max-width: 480px) {
    font-size: 0.85rem;
  }
`;

const Accent = styled.span`
  color: ${(props) => props.theme.colors.primary};
`;

const NavLinks = styled.div`
  display: flex;
  gap: 20px;
  flex: 1;

  @media (max-width: 480px) {
    gap: 10px;
  }
`;

const NavAnchorLink = styled(Link)`
  font-size: 0.88rem;
  color: ${(props) => props.theme.colors.textMuted};
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    color: ${(props) => props.theme.colors.text};
  }

  @media (max-width: 480px) {
    font-size: 0.78rem;
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
  white-space: nowrap;
  flex-shrink: 0;
  transition: transform 160ms ease-out;

  @media (max-width: 480px) {
    padding: 8px 12px;
    font-size: 0.8rem;
  }

  &:active {
    transform: scale(0.97);
  }
`;

const Hero = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 72px;
  padding: 112px 48px;

  @media (max-width: 860px) {
    flex-direction: column;
    text-align: center;
    gap: 40px;
    padding: 64px 24px;
  }
`;

const HeroVisual = styled.div`
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;

// Large, faint echoes of the Orb's own ring motif — texture drawn from the
// product's actual visual language, not a generic decorative blob.
const BackgroundRings = styled.div`
  position: absolute;
  inset: -180px;
  pointer-events: none;

  svg circle {
    fill: none;
    stroke: ${(props) => props.theme.colors.slate};
    stroke-width: 0.4;
    stroke-opacity: 0.12;
  }

  @media (max-width: 860px) {
    inset: -80px;
  }
`;

const HeroCopy = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 24px;
  max-width: 560px;

  @media (max-width: 860px) {
    align-items: center;
  }
`;

const Headline = styled.h1`
  margin: 0;
  font-family: ${(props) => props.theme.displayFontFamily};
  font-size: clamp(2.1rem, 3.6vw, 2.9rem);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  text-align: left;
  color: ${(props) => props.theme.colors.text};

  @media (max-width: 860px) {
    text-align: center;
  }
`;

// One accent, matching the Orb's own gold — not a rainbow per word.
const HAccent = styled.span`
  color: ${(props) => props.theme.streamKit.reward};
`;

const Tagline = styled.p`
  margin: 0;
  font-size: 1.02rem;
  line-height: 1.6;
  color: ${(props) => props.theme.colors.textMuted};

  @media (max-width: 860px) {
    text-align: center;
  }
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
  white-space: nowrap;
  transition: transform 160ms ease-out;

  &:active {
    transform: scale(0.97);
  }

  @media (max-width: 480px) {
    padding: 12px 18px;
    font-size: 0.88rem;
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
  white-space: nowrap;
  transition: transform 160ms ease-out;

  &:active {
    transform: scale(0.97);
  }

  @media (max-width: 480px) {
    padding: 12px 18px;
    font-size: 0.88rem;
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

const PageFooter = styled.footer`
  border-top: 1px solid ${(props) => props.theme.colors.border};
  padding: 24px 48px;

  @media (max-width: 640px) {
    padding: 20px 24px;
  }
`;

const FooterIconLink = styled.a`
  display: flex;
  color: ${(props) => props.theme.colors.textMuted};

  &:hover {
    color: ${(props) => props.theme.colors.text};
  }
`;

const FooterBottom = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 0.78rem;
  color: ${(props) => props.theme.colors.textMuted};

  @media (max-width: 640px) {
    flex-wrap: wrap;
  }
`;

const PoweredBy = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
`;

const ArcLogo = styled.img`
  height: 13px;
`;
