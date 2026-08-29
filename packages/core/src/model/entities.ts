/**
 * Ledger entities — data-model §1–§3.
 *
 * Money is integer cents everywhere inside the system; the `#.##` dollar form exists
 * only at the wire and display edges (FR-006 determinism, SC-002). No float arithmetic
 * touches an amount in this file or anything that reads it.
 */

/** Which table an action or a measurement reads. */
export type LedgerTable = 'charges' | 'payouts';

/** data-model §1 — one row of a ledger. Same shape in production and in the replica. */
export interface Charge {
  /** `chg_000001` … zero-padded, assigned in generation order. */
  id: string;
  /** `cus_0001` … ; a customer may hold several charges. */
  customer_id: string;
  status: 'disputed' | 'settled' | 'open';
  /** > 0. */
  amount_cents: number;
  /** ISO date, derived from the fixture's frozen `as_of`. */
  opened_at: string;
  /** >= 0; derived from `as_of`, materialized so the criteria grammar can compare it. */
  age_days: number;
  /** `true` ⇒ a refund already settled. Always equals `refunded_at !== null`. */
  refunded: boolean;
  refunded_at: string | null;
}

/** data-model §2 — second table of the same fixture; the User Story 3 escalation reads it. */
export interface Payout {
  /** `pay_0001` … */
  id: string;
  /** `mer_001` … */
  merchant_id: string;
  /** > 0. */
  amount_cents: number;
  payout_eligible: boolean;
}

/** The seed string that names a ledger. Two files, one shape, two independent seeds. */
export const REPLICA_SEED = 'crossexam-replica-v1';
export const PRODUCTION_SEED = 'crossexam-production-v1';

/**
 * data-model §3 — the shape both ledger files share, parameterized by its seed so a
 * replica and a production ledger are distinct types at compile time.
 */
export interface Ledger<Seed extends string> {
  seed: Seed;
  /** Frozen ISO date; what makes every `age_days` deterministic forever. */
  as_of: string;
  /** 1,500 rows. */
  charges: Charge[];
  /** 342 rows. */
  payouts: Payout[];
}

/** The generated copy the measurement runs against — never a copy of production (FR-006). */
export type ReplicaLedger = Ledger<typeof REPLICA_SEED>;

/** The ledger an allowed action is executed against. */
export type ProductionLedger = Ledger<typeof PRODUCTION_SEED>;
