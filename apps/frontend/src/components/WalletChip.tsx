import { Check, Copy, LogOut, User } from 'lucide-react';
import { useState } from 'react';
import styled from 'styled-components';

export function WalletChip({
  address,
  role,
  onSignOut,
}: {
  address: string;
  role: string;
  onSignOut: () => void;
}) {
  const [copied, setCopied] = useState(false);

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
    <Chip>
      <Avatar>
        <User size={16} />
      </Avatar>
      <TextColumn>
        <Address>{`${address.slice(0, 6)}…${address.slice(-4)}`}</Address>
        <Role>{role}</Role>
      </TextColumn>
      <CopyButton type="button" onClick={handleCopy} aria-label="Copy wallet address">
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </CopyButton>
      <SignOutButton type="button" onClick={onSignOut} aria-label="Sign out">
        <LogOut size={14} />
      </SignOutButton>
    </Chip>
  );
}

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

const CopyButton = styled.button`
  border: none;
  background: none;
  padding: 2px;
  display: flex;
  cursor: pointer;
  color: ${(props) => props.theme.colors.textMuted};

  &:hover {
    color: ${(props) => props.theme.colors.primary};
  }
`;

const SignOutButton = styled.button`
  border: none;
  background: none;
  padding: 2px;
  display: flex;
  cursor: pointer;
  color: ${(props) => props.theme.colors.textMuted};

  &:hover {
    color: ${(props) => props.theme.colors.error};
  }
`;
