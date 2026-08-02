import { type Hex, hexToString, stringToHex } from 'viem';

const CREDENTIAL_TYPE_SIZE = 32;

/** Encodes a short human-readable label (e.g. `"ISO-9001-AUDIT"`) as the `bytes32` credentialType RewardPolicy expects. */
export function encodeCredentialType(label: string): Hex {
  return stringToHex(label, { size: CREDENTIAL_TYPE_SIZE });
}

/** Decodes a `bytes32` credentialType back into its original label. */
export function decodeCredentialType(value: Hex): string {
  return hexToString(value).replace(/\0+$/, '');
}
