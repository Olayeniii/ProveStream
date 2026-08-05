import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

import logo from '../assets/logo.png';

export function LandingPage() {
  return (
    <Page>
      <Hero>
        <Logo src={logo} alt="Provenance Streams" />
        <Title>Provenance Streams</Title>
        <Tagline>
          An autonomous USDC settlement engine on Circle&apos;s Arc chain — auditors attest, AI and
          on-chain checks review it, and suppliers get paid. No human in the loop for the normal
          case.
        </Tagline>
        <LaunchButton to="/streams">
          Launch App <ArrowRight size={18} />
        </LaunchButton>
      </Hero>

      <Footer>
        <FooterLink to="/how-it-works">How it works</FooterLink>
        <FooterDivider>·</FooterDivider>
        <FooterText>
          Powered by
          <CircleLogo
            src="https://cdn.prod.website-files.com/67116d0daddc92483c812e88/67116d0daddc92483c812f72_Circle%20Logo.avif"
            alt="Circle"
          />
        </FooterText>
      </Footer>
    </Page>
  );
}

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 48px;
  padding: 24px;
  background: ${(props) => props.theme.colors.background};
`;

const Hero = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
  max-width: 560px;
`;

const Logo = styled.img`
  width: 64px;
  height: 64px;
  border-radius: 16px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: ${(props) => props.theme.type.h1};
  font-weight: 700;
  color: ${(props) => props.theme.colors.text};
`;

const Tagline = styled.p`
  margin: 0;
  font-size: 1rem;
  line-height: 1.6;
  color: ${(props) => props.theme.colors.textMuted};
`;

const LaunchButton = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 14px 28px;
  border-radius: ${(props) => props.theme.radius.pill};
  background: ${(props) => props.theme.colors.primary};
  color: ${(props) => props.theme.colors.primaryText};
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.85rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const FooterLink = styled(Link)`
  color: ${(props) => props.theme.colors.textMuted};
  text-decoration: none;

  &:hover {
    color: ${(props) => props.theme.colors.text};
  }
`;

const FooterDivider = styled.span``;

const FooterText = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const CircleLogo = styled.img`
  height: 14px;
`;
