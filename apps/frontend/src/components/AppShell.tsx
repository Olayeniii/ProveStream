import {
  Activity,
  BarChart3,
  FileText,
  Landmark,
  ShieldCheck,
  Settings,
  Truck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';

import logo from '../assets/logo.png';
import type { ApiClient } from '../lib/api.js';

const NAV_ITEMS = [
  { to: '/streams', label: 'Streams', icon: Activity },
  { to: '/auditor', label: 'Auditor', icon: ShieldCheck },
  { to: '/supplier', label: 'Supplier', icon: Truck },
  { to: '/policies', label: 'Policies', icon: FileText },
  { to: '/treasury', label: 'Treasury', icon: Landmark },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin', label: 'Admin', icon: Settings },
];

export function AppShell({
  title,
  subtitle,
  headerActions,
  api,
  children,
}: {
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  api: ApiClient;
  children: ReactNode;
}) {
  const [totalRewardsPaid, setTotalRewardsPaid] = useState<number | undefined>(undefined);
  const [streamCount, setStreamCount] = useState<number | undefined>(undefined);
  const [treasuryLabel, setTreasuryLabel] = useState<string | undefined>(undefined);

  useEffect(() => {
    api
      .listPayments()
      .then((payments) => {
        const complete = payments.filter((payment) => payment.status === 'complete');
        setTotalRewardsPaid(
          complete.reduce((sum, payment) => sum + Number(payment.rewardAmount), 0),
        );
        setStreamCount(payments.length);
      })
      .catch(() => undefined);

    api
      .getTreasuryBalance()
      .then((balance) => setTreasuryLabel(`${balance.amount} ${balance.symbol}`))
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
              {totalRewardsPaid !== undefined ? `${totalRewardsPaid.toFixed(2)} USDC` : '—'}
            </WidgetValue>
            <WidgetCaption>
              {streamCount !== undefined ? `Across ${streamCount} streams` : 'Loading…'}
            </WidgetCaption>
          </Widget>
          <Widget>
            <WidgetLabel>Treasury Balance</WidgetLabel>
            <WidgetValue>{treasuryLabel ?? '—'}</WidgetValue>
            <WidgetCaption>Developer Controlled Wallet</WidgetCaption>
          </Widget>
        </Widgets>

        <Footer>Powered by Circle</Footer>
      </Sidebar>

      <Main>
        <Header>
          <div>
            <Title>{title}</Title>
            {subtitle && <Subtitle>{subtitle}</Subtitle>}
          </div>
          {headerActions && <HeaderActions>{headerActions}</HeaderActions>}
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
  margin-top: auto;
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
`;

const WidgetCaption = styled.span`
  font-size: 0.75rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const Footer = styled.div`
  padding: 0 8px;
  font-size: 0.75rem;
  color: ${(props) => props.theme.colors.textMuted};
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
