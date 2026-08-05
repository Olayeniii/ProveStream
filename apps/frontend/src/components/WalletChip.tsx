import { Check, ChevronDown, Copy, Droplet, LogOut, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isAddress } from 'viem';
import styled from 'styled-components';

const ARC_TESTNET_FAUCET_URL = 'https://faucet.circle.com';

export interface WalletChipProps {
  address: string;
  role: string;
  /** Formatted balance (e.g. "12.5"), or `undefined` while still loading. */
  balance?: string | undefined;
  onSignOut: () => void;
  /**
   * Sends native currency (Arc's gas token — USDC) from this wallet via a
   * real Circle embedded-wallet transfer challenge. Omit to hide the "send
   * usdc" action entirely (e.g. while the wallet isn't fully ready yet).
   */
  onSend?: ((input: { destinationAddress: string; amount: string }) => Promise<{ txHash: string }>) | undefined;
}

type PanelView = 'menu' | 'send';

export function WalletChip({ address, role, balance, onSignOut, onSend }: WalletChipProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PanelView>('menu');
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setView('menu');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    <Root ref={rootRef}>
      <Trigger type="button" onClick={() => setOpen((current) => !current)}>
        <StatusDot />
        <TriggerAddress>{`${address.slice(0, 6)}…${address.slice(-4)}`}</TriggerAddress>
        <TriggerDivider>·</TriggerDivider>
        <TriggerBalance>{balance !== undefined ? `$${balance} USDC` : '—'}</TriggerBalance>
        <ChevronDown size={14} />
      </Trigger>

      {open && (
        <Panel>
          {view === 'menu' ? (
            <>
              <PanelHeader>
                <PanelLabel>Connected wallet</PanelLabel>
                <PanelRole>{role}</PanelRole>
                <PanelAddress>{address}</PanelAddress>
              </PanelHeader>
              <MenuItem type="button" onClick={handleCopy}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied' : 'Copy address'}
              </MenuItem>
              {onSend && (
                <MenuItem type="button" onClick={() => setView('send')}>
                  <Send size={15} />
                  Send USDC
                </MenuItem>
              )}
              <MenuItem as="a" href={ARC_TESTNET_FAUCET_URL} target="_blank" rel="noreferrer">
                <Droplet size={15} />
                Faucet
              </MenuItem>
              <Divider />
              <MenuItem
                type="button"
                $tone="danger"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
              >
                <LogOut size={15} />
                Disconnect
              </MenuItem>
            </>
          ) : (
            onSend && <SendForm onSend={onSend} onBack={() => setView('menu')} />
          )}
        </Panel>
      )}
    </Root>
  );
}

function SendForm({
  onSend,
  onBack,
}: {
  onSend: (input: { destinationAddress: string; amount: string }) => Promise<{ txHash: string }>;
  onBack: () => void;
}) {
  const [destinationAddress, setDestinationAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [state, setState] = useState<
    { status: 'idle' | 'sending' } | { status: 'sent'; txHash: string } | { status: 'error'; message: string }
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
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Send failed.' }),
      );
  }

  if (state.status === 'sent') {
    return (
      <PanelHeader>
        <PanelLabel>Sent</PanelLabel>
        <SentTxHash>{state.txHash}</SentTxHash>
        <BackButton type="button" onClick={onBack}>
          Done
        </BackButton>
      </PanelHeader>
    );
  }

  return (
    <SendFormBody>
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
        <BackButton type="button" onClick={onBack}>
          Cancel
        </BackButton>
        <SendButton type="button" onClick={handleSubmit} disabled={state.status === 'sending'}>
          {state.status === 'sending' ? 'Sending…' : 'Send'}
        </SendButton>
      </FormActions>
    </SendFormBody>
  );
}

const Root = styled.div`
  position: relative;
`;

const Trigger = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surfaceMuted};
  color: ${(props) => props.theme.colors.text};
  cursor: pointer;
  font-size: 0.85rem;
`;

const StatusDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: ${(props) => props.theme.colors.mint};
  flex-shrink: 0;
`;

const TriggerAddress = styled.span`
  font-family: ${(props) => props.theme.monoFontFamily};
  font-weight: 600;
`;

const TriggerDivider = styled.span`
  color: ${(props) => props.theme.colors.textMuted};
`;

const TriggerBalance = styled.span`
  color: ${(props) => props.theme.colors.textMuted};
`;

const Panel = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 260px;
  z-index: 20;
  background: ${(props) => props.theme.colors.surface};
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: ${(props) => props.theme.radius.card};
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const PanelHeader = styled.div`
  padding: 10px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const PanelLabel = styled.span`
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${(props) => props.theme.colors.textMuted};
`;

const PanelRole = styled.span`
  font-size: 0.75rem;
  color: ${(props) => props.theme.colors.textMuted};
`;

const PanelAddress = styled.span`
  font-family: ${(props) => props.theme.monoFontFamily};
  font-size: 0.78rem;
  word-break: break-all;
  color: ${(props) => props.theme.colors.text};
`;

const MenuItem = styled.button<{ $tone?: 'danger' }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: none;
  text-align: left;
  font-size: 0.85rem;
  text-decoration: none;
  cursor: pointer;
  color: ${(props) => (props.$tone === 'danger' ? props.theme.colors.error : props.theme.colors.text)};

  &:hover {
    background: ${(props) => props.theme.colors.surfaceMuted};
  }
`;

const Divider = styled.div`
  height: 1px;
  margin: 4px 0;
  background: ${(props) => props.theme.colors.border};
`;

const SendFormBody = styled.div`
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
