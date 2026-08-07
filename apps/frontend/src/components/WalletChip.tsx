import { Check, Copy, Droplet, LogOut, Send, User } from 'lucide-react';
import { useState } from 'react';
import { isAddress } from 'viem';
import styled from 'styled-components';

import { formatAmount } from '../lib/format.js';

const ARC_TESTNET_FAUCET_URL = 'https://faucet.circle.com';

export interface WalletChipProps {
  address: string;
  role: string;
  /** Formatted balance (e.g. "12.5"), or `undefined` while still loading. */
  balance?: string | undefined;
  onSignOut: () => void;
  /** Sends native currency (Arc's gas token — USDC) via a real Circle embedded-wallet transfer challenge. Omit to hide "send". */
  onSend?:
    | ((input: { destinationAddress: string; amount: string }) => Promise<{ txHash: string }>)
    | undefined;
}

export function WalletChip({ address, role, balance, onSignOut, onSend }: WalletChipProps) {
  const [copied, setCopied] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  function handleCopy() {
    navigator.clipboard
      ?.writeText(address)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  }

  return (
    <Wrap>
      <Chip>
        <Avatar>
          <User size={16} />
        </Avatar>
        <TextColumn>
          <Address>{`${address.slice(0, 6)}…${address.slice(-4)}`}</Address>
          <Role>
            {role}
            {balance !== undefined ? ` · ${formatAmount(balance, 2)} USDC` : ''}
          </Role>
        </TextColumn>
        <IconButton type="button" onClick={handleCopy} aria-label="Copy wallet address">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </IconButton>
        {onSend && (
          <IconButton
            type="button"
            onClick={() => setSendOpen((current) => !current)}
            aria-label="Send USDC"
          >
            <Send size={14} />
          </IconButton>
        )}
        <IconButton
          as="a"
          href={ARC_TESTNET_FAUCET_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Faucet"
        >
          <Droplet size={14} />
        </IconButton>
        <IconButton type="button" onClick={onSignOut} aria-label="Sign out" $tone="danger">
          <LogOut size={14} />
        </IconButton>
      </Chip>

      {sendOpen && onSend && <SendPanel onSend={onSend} onClose={() => setSendOpen(false)} />}
    </Wrap>
  );
}

function SendPanel({
  onSend,
  onClose,
}: {
  onSend: (input: { destinationAddress: string; amount: string }) => Promise<{ txHash: string }>;
  onClose: () => void;
}) {
  const [destinationAddress, setDestinationAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [state, setState] = useState<
    | { status: 'idle' | 'sending' }
    | { status: 'sent'; txHash: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  function handleSubmit() {
    if (!isAddress(destinationAddress)) {
      setState({ status: 'error', message: 'Enter a valid EVM address.' });
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setState({ status: 'error', message: 'Enter an amount greater than 0.' });
      return;
    }
    setState({ status: 'sending' });
    onSend({ destinationAddress, amount })
      .then(({ txHash }) => setState({ status: 'sent', txHash }))
      .catch((error: unknown) =>
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Send failed.',
        }),
      );
  }

  if (state.status === 'sent') {
    return (
      <Panel>
        <PanelLabel>Sent</PanelLabel>
        <SentTxHash>{state.txHash}</SentTxHash>
        <BackButton type="button" onClick={onClose}>
          Done
        </BackButton>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelLabel>Send USDC</PanelLabel>
      <Input
        placeholder="Recipient address (0x…)"
        value={destinationAddress}
        onChange={(event) => setDestinationAddress(event.target.value)}
      />
      <Input
        placeholder="Amount"
        inputMode="decimal"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      {state.status === 'error' && <FormError>{state.message}</FormError>}
      <FormActions>
        <BackButton type="button" onClick={onClose}>
          Cancel
        </BackButton>
        <SendButton type="button" onClick={handleSubmit} disabled={state.status === 'sending'}>
          {state.status === 'sending' ? 'Sending…' : 'Send'}
        </SendButton>
      </FormActions>
    </Panel>
  );
}

const Wrap = styled.div`
  position: relative;
`;

const Chip = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 6px 6px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surfaceMuted};
  color: ${(props) => props.theme.colors.text};
`;

const Avatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 999px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => props.theme.colors.violet}1a;
  color: ${(props) => props.theme.colors.violet};
`;

const TextColumn = styled.div`
  display: flex;
  flex-direction: column;
  line-height: 1.2;
`;

const Address = styled.span`
  font-family: ${(props) => props.theme.monoFontFamily};
  font-size: 0.82rem;
  font-weight: 600;
`;

const Role = styled.span`
  font-size: 0.72rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const IconButton = styled.button<{ $tone?: 'danger' }>`
  border: none;
  background: none;
  padding: 2px;
  display: flex;
  cursor: pointer;
  color: ${(props) => props.theme.colors.textMuted};
  text-decoration: none;
  transition: transform 160ms ease-out;

  &:hover {
    color: ${(props) => (props.$tone === 'danger' ? props.theme.colors.error : props.theme.colors.primary)};
  }

  &:active {
    transform: scale(0.95);
  }
`;

const Panel = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 240px;
  z-index: 20;
  background: ${(props) => props.theme.colors.surface};
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: ${(props) => props.theme.radius.card};
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const PanelLabel = styled.span`
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${(props) => props.theme.colors.textMuted};
`;

const Input = styled.input`
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surface};
  color: ${(props) => props.theme.colors.text};
  font-size: 0.82rem;

  &::placeholder {
    color: ${(props) => props.theme.colors.textMuted};
  }
`;

const FormError = styled.p`
  margin: 0;
  font-size: 0.78rem;
  color: ${(props) => props.theme.colors.error};
`;

const FormActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

const BackButton = styled.button`
  padding: 6px 12px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: transparent;
  color: ${(props) => props.theme.colors.text};
  font-size: 0.8rem;
  cursor: pointer;
`;

const SendButton = styled.button`
  padding: 6px 14px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: none;
  background: ${(props) => props.theme.colors.primary};
  color: ${(props) => props.theme.colors.primaryText};
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SentTxHash = styled.span`
  font-family: ${(props) => props.theme.monoFontFamily};
  font-size: 0.72rem;
  word-break: break-all;
  color: ${(props) => props.theme.colors.textMuted};
`;
