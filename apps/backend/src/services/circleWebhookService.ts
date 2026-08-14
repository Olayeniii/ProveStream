import { createPublicKey, createVerify } from 'node:crypto';

/**
 * Verifies Circle webhook notifications against their real, documented
 * scheme (https://developers.circle.com/api-reference/verify-webhook-signatures)
 * — public-key signature verification, not a shared-secret HMAC:
 *
 * 1. The request carries `X-Circle-Key-Id` (a UUID) and `X-Circle-Signature`
 *    (base64, ECDSA_SHA_256 over the *raw* request body — re-serializing
 *    parsed JSON changes byte order and breaks verification, so the caller
 *    must pass the untouched body).
 * 2. The public key for that `keyId` is fetched from Circle's API
 *    (`GET /v2/notifications/publicKey/{keyId}`, bearer-authenticated with
 *    the same `CIRCLE_API_KEY` already used for wallets/treasury) and
 *    cached — Circle's own docs note a keyId's public key is static.
 */
export class CircleWebhookService {
  private readonly publicKeyCache = new Map<string, { algorithm: string; publicKeyDer: string }>();

  constructor(private readonly apiKey: string) {}

  private async getPublicKey(keyId: string): Promise<{ algorithm: string; publicKeyDer: string }> {
    const cached = this.publicKeyCache.get(keyId);
    if (cached) {
      return cached;
    }

    const response = await fetch(`https://api.circle.com/v2/notifications/publicKey/${keyId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Circle notification public key (status ${response.status.toString()}).`,
      );
    }
    const body = (await response.json()) as {
      data?: { algorithm?: string; publicKey?: string };
    };
    if (!body.data?.algorithm || !body.data.publicKey) {
      throw new Error('Circle public key response is missing algorithm/publicKey.');
    }

    const entry = { algorithm: body.data.algorithm, publicKeyDer: body.data.publicKey };
    this.publicKeyCache.set(keyId, entry);
    return entry;
  }

  /** `rawBody` must be the exact, untouched request body bytes — not `JSON.parse`d and re-serialized. */
  async verify(rawBody: Buffer, keyId: string, signatureBase64: string): Promise<boolean> {
    const { algorithm, publicKeyDer } = await this.getPublicKey(keyId);
    if (algorithm !== 'ECDSA_SHA_256') {
      throw new Error(`Unsupported Circle notification signature algorithm: ${algorithm}`);
    }

    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyDer, 'base64'),
      format: 'der',
      type: 'spki',
    });

    const verifier = createVerify('SHA256');
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(publicKey, signatureBase64, 'base64');
  }
}
