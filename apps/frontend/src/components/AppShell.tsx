import { arcTestnet, hardhatLocal } from '@provenance-streams/protocol';
import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  FileText,
  Landmark,
  ShieldCheck,
  Settings,
  Truck,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';
import { formatUnits } from 'viem';

import logo from '../assets/logo.png';
import type { AppEnv } from '../env.js';
import type { ApiClient } from '../lib/api.js';
import { formatAmount } from '../lib/format.js';

const NAV_ITEMS = [
  { to: '/streams', label: 'Streams', icon: Activity },
  { to: '/auditor', label: 'Auditor', icon: ShieldCheck },
  { to: '/supplier', label: 'Supplier', icon: Truck },
  { to: '/policies', label: 'Policies', icon: FileText },
  { to: '/treasury', label: 'Treasury', icon: Landmark },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin', label: 'Admin', icon: Settings },
];

function networkLabel(chainId: number): string {
  if (chainId === arcTestnet.id) {
    return 'Arc Testnet';
  }
  if (chainId === hardhatLocal.id) {
    return 'Hardhat Local';
  }
  return `Chain ${chainId}`;
}

export function AppShell({
  title,
  subtitle,
  headerActions,
  env,
  api,
  children,
}: {
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  env: AppEnv;
  api: ApiClient;
  children: ReactNode;
}) {
  const [totalRewardsPaid, setTotalRewardsPaid] = useState<string | undefined>(undefined);
  const [streamCount, setStreamCount] = useState<number | undefined>(undefined);
  const [treasuryLabel, setTreasuryLabel] = useState<string | undefined>(undefined);

  useEffect(() => {
    api
      .listPayments()
      .then((payments) => {
        const complete = payments.filter((payment) => payment.status === 'complete');
        const total = complete.reduce((sum, payment) => sum + BigInt(payment.rewardAmount), 0n);
        setTotalRewardsPaid(formatAmount(formatUnits(total, 18), 4));
        setStreamCount(payments.length);
      })
      .catch(() => undefined);

    api
      .getTreasuryBalance()
      .then((balance) => setTreasuryLabel(`${formatAmount(balance.amount, 4)} USDC`))
      .catch(() => undefined);
  }, [api]);

  return (
    <Page>
      <Sidebar>
        <Brand>
          <Logo src={logo} alt="Provenance Streams" />
          <BrandText>Provenance Streams</BrandText>
        </Brand>

        <Nav>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <StyledNavLink key={to} to={to}>
              <Icon size={18} strokeWidth={2} />
              {label}
            </StyledNavLink>
          ))}
        </Nav>

        <Widgets>
          <Widget>
            <WidgetLabel>Total Rewards Paid</WidgetLabel>
            <WidgetValue>
              {totalRewardsPaid !== undefined ? `${totalRewardsPaid} USDC` : '—'}
            </WidgetValue>
            <WidgetCaption>
              {streamCount !== undefined ? `Across ${streamCount} streams` : 'Loading…'}
            </WidgetCaption>
          </Widget>
          <Widget>
            <WidgetLabel>Treasury Balance</WidgetLabel>
            <WidgetValue>{treasuryLabel ?? '—'}</WidgetValue>
            <WidgetCaption>Developer Controlled Wallet</WidgetCaption>
            <TreasuryIcon>
              <Wallet size={16} />
            </TreasuryIcon>
          </Widget>
        </Widgets>

        <Footer>
          Powered by
          <CircleLogo
            src="https://cdn.prod.website-files.com/67116d0daddc92483c812e88/67116d0daddc92483c812f72_Circle%20Logo.avif"
            alt="Circle"
          />
        </Footer>
      </Sidebar>

      <Main>
        <Header>
          <div>
            <Title>{title}</Title>
            {subtitle && <Subtitle>{subtitle}</Subtitle>}
          </div>
          <HeaderActions>
            <NetworkChip>
              {networkLabel(env.chainId)}
              <ChevronDown size={14} />
            </NetworkChip>
            {headerActions}
            <BellButton type="button" aria-label="Notifications">
              <Bell size={18} />
            </BellButton>
          </HeaderActions>
        </Header>
        <Content>{children}</Content>
      </Main>
    </Page>
  );
}

const Page = styled.div`
  min-height: 100%;
  display: flex;
`;

const Sidebar = styled.aside`
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px 16px;
  border-right: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surface};

  @media (max-width: 900px) {
    display: none;
  }
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
`;

const Logo = styled.img`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
`;

const BrandText = styled.span`
  font-weight: 700;
  font-size: 0.95rem;
  color: ${(props) => props.theme.colors.text};
`;

const Nav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const StyledNavLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: ${(props) => props.theme.radius.card};
  color: ${(props) => props.theme.colors.textMuted};
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;

  &:hover {
    background: ${(props) => props.theme.colors.surfaceMuted};
  }

  &.active {
    background: ${(props) => props.theme.colors.primary}1a;
    color: ${(props) => props.theme.colors.primary};
  }
`;

const Widgets = styled.div`
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Widget = styled.div`
  padding: 14px 16px;
  border-radius: ${(props) => props.theme.radius.card};
  background: ${(props) => props.theme.colors.surfaceMuted};
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const WidgetLabel = styled.span`
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${(props) => props.theme.colors.textMuted};
`;

const WidgetValue = styled.span`
  font-size: 1.1rem;
  font-weight: 700;
  color: ${(props) => props.theme.colors.text};
  word-break: break-word;
`;

const WidgetCaption = styled.span`
  font-size: 0.75rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const TreasuryIcon = styled.div`
  margin: 8px auto 0;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => props.theme.colors.primary}1a;
  color: ${(props) => props.theme.colors.primary};
`;

const Footer = styled.div`
  margin-top: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  font-size: 0.75rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const CircleLogo = styled.img`
  height: 16px;
  width: auto;
  object-fit: contain;
`;

const Main = styled.main`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 32px;
  border-bottom: 1px solid ${(props) => props.theme.colors.border};
  flex-wrap: wrap;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: ${(props) => props.theme.colors.text};
`;

const Subtitle = styled.p`
  margin: 4px 0 0;
  font-size: 0.9rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const NetworkChip = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surface};
  color: ${(props) => props.theme.colors.text};
  font-size: 0.82rem;
  font-weight: 500;
  white-space: nowrap;
`;

const BellButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surface};
  color: ${(props) => props.theme.colors.textMuted};
  cursor: pointer;

  &:hover {
    color: ${(props) => props.theme.colors.primary};
  }
`;

const Content = styled.div`
  flex: 1;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
`;
