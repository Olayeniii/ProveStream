import { arcTestnet, hardhatLocal } from '@provenance-streams/protocol';
import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  FileText,
  Landmark,
  Menu,
  ShieldCheck,
  Settings,
  Truck,
  Wallet,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';
import { formatUnits } from 'viem';

import logo from '../assets/logo.png';
import { Skeleton } from './Skeleton.js';
import { UsdcIcon } from './UsdcIcon.js';
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
      .then((balance) => setTreasuryLabel(formatAmount(balance.amount, 4)))
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

        <Spacer />

        <Widgets>
          <Widget>
            <WidgetLabel>Total Rewards Paid</WidgetLabel>
            <WidgetValue>
              {totalRewardsPaid !== undefined ? (
                <>
                  <UsdcIcon /> {totalRewardsPaid} USDC
                </>
              ) : (
                '—'
              )}
            </WidgetValue>
            <WidgetCaption>
              {streamCount !== undefined ? (
                `Across ${streamCount} streams`
              ) : (
                <Skeleton $width="80px" $height="0.85em" />
              )}
            </WidgetCaption>
          </Widget>
          <Widget>
            <WidgetLabel>Treasury Balance</WidgetLabel>
            <WidgetValue>
              {treasuryLabel !== undefined ? (
                <>
                  <UsdcIcon /> {treasuryLabel} USDC
                </>
              ) : (
                '—'
              )}
            </WidgetValue>
            <WidgetCaption>Developer Controlled Wallet</WidgetCaption>
            <TreasuryIcon>
              <Wallet size={16} />
            </TreasuryIcon>
          </Widget>
        </Widgets>

        <Spacer />

        <Footer>
          Powered by
          <CircleLogo
            src="https://cdn.prod.website-files.com/67116d0daddc92483c812e88/67116d0daddc92483c812f72_Circle%20Logo.avif"
            alt="Circle"
          />
        </Footer>
      </Sidebar>

      {mobileNavOpen && (
        <MobileNavOverlay onClick={() => setMobileNavOpen(false)}>
          <MobileNavPanel onClick={(event) => event.stopPropagation()}>
            <MobileNavHeader>
              <Brand>
                <Logo src={logo} alt="Provenance Streams" />
                <BrandText>Provenance Streams</BrandText>
              </Brand>
              <CloseButton
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
              >
                <X size={20} />
              </CloseButton>
            </MobileNavHeader>
            <Nav>
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <StyledNavLink key={to} to={to} onClick={() => setMobileNavOpen(false)}>
                  <Icon size={18} strokeWidth={2} />
                  {label}
                </StyledNavLink>
              ))}
            </Nav>
          </MobileNavPanel>
        </MobileNavOverlay>
      )}

      <Main>
        <Header>
          <HeaderStart>
            <MenuButton
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu size={20} />
            </MenuButton>
            <div>
              <Title>{title}</Title>
              {subtitle && <Subtitle>{subtitle}</Subtitle>}
            </div>
          </HeaderStart>
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

  /*
   * Without this, Sidebar is a plain flex item that stretches to match
   * Content's full height (flex default align-items: stretch) — so a long
   * page (a long list, or a raw error dump before it was cleaned up) drags
   * the sidebar's background/border down the entire page instead of it
   * staying pinned to the viewport while Content scrolls underneath it.
   */
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;

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

const Spacer = styled.div`
  flex: 1;
`;

const Widgets = styled.div`
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

const HeaderStart = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

/** Only shown below the same 900px breakpoint Sidebar disappears at — this is
 * the sidebar's mobile replacement, not a decorative extra. */
const MenuButton = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surface};
  color: ${(props) => props.theme.colors.text};
  cursor: pointer;

  @media (max-width: 900px) {
    display: flex;
  }
`;

const MobileNavOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(15, 23, 42, 0.4);
`;

const MobileNavPanel = styled.div`
  width: 260px;
  max-width: 80vw;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 16px;
  background: ${(props) => props.theme.colors.surface};
  overflow-y: auto;
`;

const MobileNavHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: none;
  background: ${(props) => props.theme.colors.surfaceMuted};
  color: ${(props) => props.theme.colors.textMuted};
  cursor: pointer;
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
