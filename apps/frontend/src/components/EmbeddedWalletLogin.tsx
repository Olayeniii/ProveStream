import { useState } from 'react';
import type { FormEvent } from 'react';
import styled from 'styled-components';

import type { EmbeddedWalletState } from '../hooks/useEmbeddedWallet.js';

export function EmbeddedWalletLogin({ wallet }: { wallet: EmbeddedWalletState }) {
  const [email, setEmail] = useState('');
  const busy = wallet.status === 'logging-in' || wallet.status === 'creating-wallet';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    wallet.login(email);
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={busy}
        required
      />
      <LoginButton type="submit" disabled={busy}>
        {wallet.status === 'creating-wallet'
          ? 'Creating wallet…'
          : wallet.status === 'logging-in'
            ? 'Signing in…'
            : 'Sign in with Embedded Wallet'}
      </LoginButton>
      {wallet.status === 'error' && <ErrorText>{wallet.error}</ErrorText>}
    </Form>
  );
}

const Form = styled.form`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 440px;
`;

const Input = styled.input`
  flex: 1;
  min-width: 180px;
  padding: 10px 12px;
  border-radius: ${(props) => props.theme.radius.card};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surfaceMuted};
  color: ${(props) => props.theme.colors.text};
  font-size: 0.9rem;

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.colors.primary};
  }

  &:disabled {
    opacity: 0.6;
  }
`;

const LoginButton = styled.button`
  padding: 10px 16px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: none;
  background: ${(props) => props.theme.colors.primary};
  color: ${(props) => props.theme.colors.primaryText};
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  white-space: nowrap;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.span`
  width: 100%;
  font-size: 0.8rem;
  color: ${(props) => props.theme.colors.error};
`;
