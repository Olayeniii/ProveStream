pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";

/// Proves a supplier's private evidence value meets or exceeds a policy's
/// public threshold, without revealing the value itself — e.g. "this
/// compliance metric is >= 90" without disclosing the real number.
///
/// The circuit is only *satisfiable* when `value >= threshold` is actually
/// true: `meetsThreshold === 1` means an honest prover cannot generate a
/// valid proof for a false claim at all, not just report `false` for one.
/// `bits` bounds the range both values must fit in (circomlib's
/// `GreaterEqThan`/`LessThan` cap out at 252) — 32 comfortably covers any
/// realistic compliance metric this project scores (percentages, counts,
/// small measurements) while keeping the circuit small.
template ThresholdCheck(bits) {
    signal input value; // private — never revealed
    signal input threshold; // public — the policy's requirement
    signal output meetsThreshold;

    component gte = GreaterEqThan(bits);
    gte.in[0] <== value;
    gte.in[1] <== threshold;

    meetsThreshold <== gte.out;
    meetsThreshold === 1;
}

component main { public [threshold] } = ThresholdCheck(32);
