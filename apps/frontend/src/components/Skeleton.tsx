import styled, { keyframes } from 'styled-components';

/**
 * A placeholder shape matching the size of the real content it stands in for
 * — per impeccable's operate.md ("Skeleton states for loading, not spinners
 * in the middle of content"), used in place of literal "Loading…" text.
 */
export const Skeleton = styled.span<{ $width?: string; $height?: string }>`
  display: inline-block;
  width: ${(props) => props.$width ?? '64px'};
  height: ${(props) => props.$height ?? '1em'};
  border-radius: 4px;
  background: ${(props) => props.theme.colors.surfaceMuted};
  vertical-align: middle;

  @media (prefers-reduced-motion: no-preference) {
    animation: ${keyframes`
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    `}
      1.4s ease-in-out infinite;
  }
`;
