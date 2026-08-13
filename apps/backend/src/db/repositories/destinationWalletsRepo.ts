import type { DestinationWallet } from '@provenance-streams/protocol';
import type { Pool } from 'pg';
import type { Address } from 'viem';

interface Row {
  supplier: string;
  chain: string;
  address: string;
  x402_claim_url: string | null;
  registered_at: Date;
}

function toWallet(row: Row): DestinationWallet {
  return {
    supplier: row.supplier as Address,
    chain: row.chain,
    address: row.address,
    registeredAt: row.registered_at.toISOString(),
    ...(row.x402_claim_url ? { x402ClaimUrl: row.x402_claim_url } : {}),
  };
}

export function createDestinationWalletsRepo(pool: Pool) {
  return {
    /** Full overwrite on conflict, matching the in-memory `Store`'s prior `Map.set` semantics. */
    async register(input: {
      supplier: Address;
      chain: string;
      /** Not always `0x`-prefixed — Solana destinations use base58. */
      address: string;
      x402ClaimUrl?: string | undefined;
    }): Promise<DestinationWallet> {
      const result = await pool.query<Row>(
        `INSERT INTO destination_wallets (supplier, chain, address, x402_claim_url, registered_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (supplier) DO UPDATE SET
           chain = EXCLUDED.chain,
           address = EXCLUDED.address,
           x402_claim_url = EXCLUDED.x402_claim_url,
           registered_at = now()
         RETURNING *`,
        [input.supplier, input.chain, input.address, input.x402ClaimUrl ?? null],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('Failed to register destination wallet.');
      }
      return toWallet(row);
    },

    async get(supplier: Address): Promise<DestinationWallet | undefined> {
      const result = await pool.query<Row>(
        'SELECT * FROM destination_wallets WHERE supplier = $1',
        [supplier],
      );
      return result.rows[0] ? toWallet(result.rows[0]) : undefined;
    },
  };
}

export type DestinationWalletsRepo = ReturnType<typeof createDestinationWalletsRepo>;
