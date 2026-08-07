import styled, { css, keyframes } from 'styled-components';

export interface StreamOrbProps {
  /** 0-100 — how much of the pipeline is verified/complete. Fills the outer ring. */
  verification: number;
  /** 0-100 — the AI's confidence in its assessment, when known. Fills the inner ring. */
  confidence: number;
  /** Whether a reward has actually settled — the core blooms gold when true, stays dormant otherwise. */
  rewardSettled: boolean;
  size?: number;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * The Stream Orb — four layers, each tied to real state, never decorative (see
 * the provenance-streams-design skill / "The Provenance Book"): outer ring =
 * verification, inner ring = confidence (pulses on increase), core = reward
 * (gold bloom on settlement), center dot = identity (constant amber, never
 * varies). Deliberately not a loading spinner — motion is state-driven and
 * finite, not a perpetual loop.
 */
export function StreamOrb({ verification, confidence, rewardSettled, size = 140 }: StreamOrbProps) {
  return (
    <Outer $size={size} $percent={clampPercent(verification)}>
      <OuterMask $size={size}>
        <Inner $size={size} $percent={clampPercent(confidence)}>
          <InnerMask $size={size}>
            <Core $size={size} $settled={rewardSettled}>
              <IdentityDot $size={size} />
            </Core>
          </InnerMask>
        </Inner>
      </OuterMask>
    </Outer>
  );
}

const bloom = keyframes`
  0% { transform: scale(0.9); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
`;

const Outer = styled.div<{ $size: number; $percent: number }>`
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: conic-gradient(
    ${(props) => props.theme.streamKit.verification} ${(props) => props.$percent * 3.6}deg,
    ${(props) => props.theme.colors.surfaceMuted} 0deg
  );
  transition: background 400ms cubic-bezier(0.23, 1, 0.32, 1);
`;

const OuterMask = styled.div<{ $size: number }>`
  width: ${(props) => props.$size * 0.86}px;
  height: ${(props) => props.$size * 0.86}px;
  border-radius: 999px;
  background: ${(props) => props.theme.colors.surface};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Inner = styled.div<{ $size: number; $percent: number }>`
  width: ${(props) => props.$size * 0.74}px;
  height: ${(props) => props.$size * 0.74}px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: conic-gradient(
    ${(props) => props.theme.streamKit.confidence} ${(props) => props.$percent * 3.6}deg,
    ${(props) => props.theme.colors.surfaceMuted} 0deg
  );
  transition: background 400ms cubic-bezier(0.23, 1, 0.32, 1);
`;

const InnerMask = styled.div<{ $size: number }>`
  width: ${(props) => props.$size * 0.6}px;
  height: ${(props) => props.$size * 0.6}px;
  border-radius: 999px;
  background: ${(props) => props.theme.colors.surface};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Core = styled.div<{ $size: number; $settled: boolean }>`
  width: ${(props) => props.$size * 0.44}px;
  height: ${(props) => props.$size * 0.44}px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) =>
    props.$settled ? props.theme.streamKit.reward : props.theme.colors.surfaceMuted};
  box-shadow: ${(props) =>
    props.$settled ? `0 0 24px 4px ${props.theme.streamKit.reward}66` : 'none'};
  transition:
    background 400ms cubic-bezier(0.23, 1, 0.32, 1),
    box-shadow 400ms cubic-bezier(0.23, 1, 0.32, 1);

  @media (prefers-reduced-motion: no-preference) {
    ${(props) =>
      props.$settled &&
      css`
        animation: ${bloom} 400ms cubic-bezier(0.23, 1, 0.32, 1);
      `}
  }
`;

const IdentityDot = styled.div<{ $size: number }>`
  width: ${(props) => Math.max(4, props.$size * 0.07)}px;
  height: ${(props) => Math.max(4, props.$size * 0.07)}px;
  border-radius: 999px;
  background: ${(props) => props.theme.streamKit.identity};
`;
