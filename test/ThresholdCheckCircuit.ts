import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// `circom_tester` is a plain CommonJS package with no type declarations —
// loaded via `createRequire` rather than a typed `import`, same reasoning
// as any other untyped JS dependency.
const require = createRequire(import.meta.url);

type WasmTester = (
  circuitPath: string,
  options: { include: string[] },
) => Promise<{
  calculateWitness: (input: Record<string, unknown>) => Promise<bigint[]>;
  checkConstraints: (witness: bigint[]) => Promise<void>;
}>;
const circomTester = require('circom_tester') as { wasm: WasmTester };
const wasmTester = circomTester.wasm;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const circuitPath = path.join(__dirname, '../circuits/thresholdCheck.circom');
const circomOptions = { include: [path.join(__dirname, '../node_modules')] };

const CIRCUIT_TEST_TIMEOUT_MS = 120_000;

void describe('ThresholdCheck circuit', () => {
  void it(
    'accepts a value that meets the threshold',
    { timeout: CIRCUIT_TEST_TIMEOUT_MS },
    async () => {
      const circuit = await wasmTester(circuitPath, circomOptions);
      const witness = await circuit.calculateWitness({ value: 95, threshold: 90 });
      await circuit.checkConstraints(witness);
      // witness[0] is always 1 (circom's constant wire); witness[1] is the
      // circuit's single declared output, `meetsThreshold`.
      assert.equal(witness[1], 1n);
    },
  );

  void it(
    'accepts a value exactly equal to the threshold',
    { timeout: CIRCUIT_TEST_TIMEOUT_MS },
    async () => {
      const circuit = await wasmTester(circuitPath, circomOptions);
      const witness = await circuit.calculateWitness({ value: 90, threshold: 90 });
      await circuit.checkConstraints(witness);
      assert.equal(witness[1], 1n);
    },
  );

  void it(
    'refuses to produce a witness for a value below the threshold',
    { timeout: CIRCUIT_TEST_TIMEOUT_MS },
    async () => {
      const circuit = await wasmTester(circuitPath, circomOptions);
      await assert.rejects(circuit.calculateWitness({ value: 50, threshold: 90 }));
    },
  );
});
