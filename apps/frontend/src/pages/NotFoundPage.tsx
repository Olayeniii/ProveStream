import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

import { AppShell } from '../components/AppShell.js';
import type { AppEnv } from '../env.js';
import type { ApiClient } from '../lib/api.js';

export function NotFoundPage({ env, api }: { env: AppEnv; api: ApiClient }) {
  return (
    <AppShell title="Not found" subtitle="This page doesn't exist" env={env} api={api}>
      <Wrap>
        <Compass size={32} strokeWidth={1.5} />
        <Message>
          There&apos;s nothing at this address. Head back to <Link to="/streams">streams</Link> or
          the <Link to="/">home page</Link>.
        </Message>
      </Wrap>
    </AppShell>
  );
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 64px 24px;
  text-align: center;
  color: ${(props) => props.theme.colors.textMuted};
`;

const Message = styled.p`
  margin: 0;
  max-width: 360px;
  font-size: 0.95rem;
  line-height: 1.6;

  a {
    color: ${(props) => props.theme.colors.primary};
    font-weight: 600;
  }
`;
