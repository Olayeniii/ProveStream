import { LogOut, Wallet } from 'lucide-react';
import styled from 'styled-components';

export function WalletChip({ address, onSignOut }: { address: string; onSignOut: () => void }) {
  return (
    <Chip>
      <Wallet size={16} />
      <Address>{`${address.slice(0, 6)}…${address.slice(-4)}`}</Address>
      <SignOutButton type="button" onClick={onSignOut} aria-label="Sign out">
        <LogOut size={14} />
      </SignOutButton>
    </Chip>
  );
}

const Chip = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: ${(props) => props.theme.radius.pill};
  border: 1px solid ${(props) => props.theme.colors.border};
  background: ${(props) => props.theme.colors.surfaceMuted};
  color: ${(props) => props.theme.colors.text};
  font-size: 0.85rem;
`;

const Address = styled.span`
  font-family: ${(props) => props.theme.monoFontFamily};
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
