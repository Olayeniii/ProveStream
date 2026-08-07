import { useEffect, useId, useRef, useState } from 'react';
import styled, { css, keyframes, useTheme } from 'styled-components';

export interface StreamOrbProps {
  /** 0-100 — how much of the pipeline is verified/complete. Fills the outer ring. */
  verification: number;
  /** 0-100 — the AI's confidence in its assessment, when known. Fills the inner ring. */
  confidence: number;
  /** Whether a reward has actually settled — the core blooms gold when true, stays dormant otherwise. */
  rewardSettled: boolean;
  size?: number;
}

const VIEW_BOX = 200;
const CENTER = VIEW_BOX / 2;
const R_OUTER = 92;
const R_INNER = 74;
const R_CORE = 54;
const CIRC_OUTER = 2 * Math.PI * R_OUTER;
const CIRC_INNER = 2 * Math.PI * R_INNER;

function clampFraction(percent: number): number {
  return Math.max(0, Math.min(1, percent / 100));
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * The Stream Orb — four layers, each tied to real state (see the
 * provenance-streams-design skill / "The Provenance Book"): outer ring =
 * verification, inner ring = confidence (a halo pulses outward when it rises),
 * core = reward (radial gold bloom on settlement), center dot = identity
 * (constant amber, orbits the completed verification arc while live). The
 * continuous breathing/orbit motion is gated behind `prefers-reduced-motion`;
 * the halo and bloom are brief, finite, state-triggered transitions that still
 * play under reduced motion (opacity-only, no travel) so the state change
 * itself stays visible.
 */
export function StreamOrb({ verification, confidence, rewardSettled, size = 140 }: StreamOrbProps) {
  const theme = useTheme();
  const gradientId = useId();
  const reducedMotion = usePrefersReducedMotion();

  const v = clampFraction(verification);
  const c = clampFraction(confidence);

  const [halos, setHalos] = useState<string[]>([]);
  const prevConfidence = useRef(c);
  useEffect(() => {
    if (c > prevConfidence.current + 0.001) {
      const id = Math.random().toString(36).slice(2);
      setHalos((current) => [...current, id]);
      const timeout = setTimeout(
        () => setHalos((current) => current.filter((entry) => entry !== id)),
        1100,
      );
      prevConfidence.current = c;
      return () => clearTimeout(timeout);
    }
    prevConfidence.current = c;
    return undefined;
  }, [c]);

  const [blooming, setBlooming] = useState(false);
  const prevSettled = useRef(rewardSettled);
  useEffect(() => {
    if (rewardSettled && !prevSettled.current) {
      setBlooming(true);
      const timeout = setTimeout(() => setBlooming(false), 1400);
      prevSettled.current = rewardSettled;
      return () => clearTimeout(timeout);
    }
    prevSettled.current = rewardSettled;
    return undefined;
  }, [rewardSettled]);

  return (
    <Wrapper $size={size}>
      <svg
        viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
        width="100%"
        height="100%"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/*
            Always a dark, moody body with a warm off-center glow (cx/cy at
            50%/45%, not centered — a natural single light source, per
            emil-design-eng) — settlement intensifies the glow rather than
            flipping the core between two flat colors.
          */}
          <radialGradient id={gradientId} cx="50%" cy="45%" r="65%">
            <stop
              offset="0%"
              stopColor={theme.streamKit.reward}
              stopOpacity={rewardSettled ? 0.95 : 0.3}
            />
            <stop offset="45%" stopColor={theme.colors.dark} stopOpacity={0.92} />
            <stop offset="100%" stopColor={theme.colors.dark} />
          </radialGradient>
        </defs>

        {/* Outer ring — verification */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R_OUTER}
          fill="none"
          stroke={theme.streamKit.verification}
          strokeOpacity={0.16}
          strokeWidth={4}
        />
        <RingProgress
          cx={CENTER}
          cy={CENTER}
          r={R_OUTER}
          stroke={theme.streamKit.verification}
          strokeWidth={4}
          $circumference={CIRC_OUTER}
          $offset={CIRC_OUTER * (1 - v)}
        />
        {v > 0 && (
          <circle r={4} fill={theme.streamKit.identity}>
            {!reducedMotion && (
              <animateMotion
                dur="4s"
                repeatCount="indefinite"
                path={`M ${CENTER} ${CENTER - R_OUTER} A ${R_OUTER} ${R_OUTER} 0 1 1 ${CENTER - 0.01} ${CENTER - R_OUTER} Z`}
              />
            )}
          </circle>
        )}

        {/* Inner ring — confidence */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R_INNER}
          fill="none"
          stroke={theme.streamKit.confidence}
          strokeOpacity={0.2}
          strokeWidth={3}
        />
        <RingProgress
          cx={CENTER}
          cy={CENTER}
          r={R_INNER}
          stroke={theme.streamKit.confidence}
          strokeWidth={3}
          $circumference={CIRC_INNER}
          $offset={CIRC_INNER * (1 - c)}
          style={{ opacity: c > 0 ? 1 : 0 }}
        />
        {halos.map((id) => (
          <ConfidenceHalo
            key={id}
            cx={CENTER}
            cy={CENTER}
            r={R_INNER}
            stroke={theme.streamKit.confidence}
            strokeWidth={2}
            $reducedMotion={reducedMotion}
          />
        ))}

        {/* Core — reward */}
        <Core
          cx={CENTER}
          cy={CENTER}
          r={R_CORE}
          fill={`url(#${gradientId})`}
          $reducedMotion={reducedMotion}
        />
        {blooming && (
          <BloomRing
            cx={CENTER}
            cy={CENTER}
            r={R_CORE}
            fill="none"
            stroke={theme.streamKit.reward}
            strokeWidth={3}
            $reducedMotion={reducedMotion}
          />
        )}

        {/* Center dot — identity, constant amber */}
        <PulsingDot
          cx={CENTER}
          cy={CENTER}
          r={5}
          fill={theme.streamKit.identity}
          $reducedMotion={reducedMotion}
        />
      </svg>
    </Wrapper>
  );
}

const Wrapper = styled.div<{ $size: number }>`
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;
  flex-shrink: 0;
`;

const RingProgress = styled.circle<{ $circumference: number; $offset: number }>`
  fill: none;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: ${CENTER}px ${CENTER}px;
  stroke-dasharray: ${(props) => props.$circumference}px;
  stroke-dashoffset: ${(props) => props.$offset}px;
  transition:
    stroke-dashoffset 600ms ease,
    opacity 600ms ease;
`;

const haloExpand = keyframes`
  0% { r: ${R_INNER - 2}px; opacity: 0.65; }
  100% { r: ${R_INNER + 18}px; opacity: 0; }
`;

const haloFlash = keyframes`
  0% { opacity: 0.65; }
  100% { opacity: 0; }
`;

const ConfidenceHalo = styled.circle<{ $reducedMotion: boolean }>`
  fill: none;
  animation: ${(props) => (props.$reducedMotion ? haloFlash : haloExpand)} 1.1s ease-out forwards;
`;

const bloomExpand = keyframes`
  0% { r: ${R_CORE}px; opacity: 0.9; }
  100% { r: ${R_CORE + 34}px; opacity: 0; }
`;

const bloomFlash = keyframes`
  0% { opacity: 0.9; }
  100% { opacity: 0; }
`;

const BloomRing = styled.circle<{ $reducedMotion: boolean }>`
  animation: ${(props) => (props.$reducedMotion ? bloomFlash : bloomExpand)} 1.4s
    cubic-bezier(0.16, 1, 0.3, 1) forwards;
`;

const breathe = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.035); }
`;

const Core = styled.circle<{ $reducedMotion: boolean }>`
  transform-origin: ${CENTER}px ${CENTER}px;
  transition: fill 400ms ease;

  ${(props) =>
    !props.$reducedMotion &&
    css`
      animation: ${breathe} 4.5s ease-in-out infinite;
    `}
`;

const pulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.18); opacity: 1; }
`;

const PulsingDot = styled.circle<{ $reducedMotion: boolean }>`
  transform-origin: ${CENTER}px ${CENTER}px;

  ${(props) =>
    !props.$reducedMotion &&
    css`
      animation: ${pulse} 3s ease-in-out infinite;
    `}
`;
