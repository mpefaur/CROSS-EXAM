/**
 * RNG-free ledger generator — research.md D-05, data-model §1–§3.
 *
 * There is no randomness anywhere in this file, not even a seeded PRNG (FR-006).
 * Amounts come from a fixed repeating cycle and the last row of each cohort absorbs the
 * remainder, so every cohort total lands exactly on the spec's figure. The seed only
 * shifts incidental fields — which slot of the cycle a cohort starts on, which customer
 * or merchant a row belongs to, where each cohort's age phase begins — so the replica and
 * the production ledger are equivalent for the demo scenario without either being a copy
 * of the other (FR-006).
 *
 * All money is integer cents; no float arithmetic touches an amount.
 */

import type { Charge, Ledger, Payout } from '../model/entities.ts';

/**
 * Frozen fixture date. Nothing in the spec pins it; it is chosen here so that every
 * `age_days` — and therefore every `opened_at` — is deterministic forever.
 */
const AS_OF = '2026-08-01';
const AS_OF_EPOCH_MS = Date.UTC(2026, 7, 1);
const MS_PER_DAY = 86_400_000;

/** A customer holds several charges (data-model §1): 1,500 charges over 400 customers. */
const CUSTOMER_COUNT = 400;
const MERCHANT_COUNT = 120;
/** Prime, so the four cohorts' age phases stay distinct from the cycle rotation. */
const AGE_PHASE_MODULUS = 97;

/**
 * The charge amount cycle. Its average (7,900 cents) sits below every cohort's average,
 * which is what keeps each absorbing remainder positive.
 */
const CHARGE_CYCLE: readonly number[] = [4500, 6250, 9900, 3750, 12_500, 7100, 8800, 10_400];
const PAYOUT_CYCLE: readonly number[] = [
  98_000, 145_000, 112_500, 87_500, 168_000, 121_000, 93_500, 150_000,
];

/** research.md D-05 — every payout row is eligible, so the predicate does not filter. */
const PAYOUT_COUNT = 342;
const PAYOUT_TOTAL_CENTS = 41_822_000;

interface Cohort {
  /** Named in the absorbing-amount assertion so a bad cycle fails loudly, not silently. */
  readonly name: string;
  readonly count: number;
  readonly totalCents: number;
  readonly refunded: boolean;
  readonly status: (index: number, phase: number) => Charge['status'];
  readonly ageDays: (index: number, phase: number) => number;
}

/**
 * research.md D-05. The counts and the disputed/settled totals are the spec's; the split
 * of the $96,310.00 disputed total between the two large cohorts is free within it, and is
 * chosen so every remainder lands positive.
 */
const COHORTS: readonly Cohort[] = [
  {
    name: 'disputed+refunded',
    count: 611,
    totalCents: 4_880_000,
    refunded: true,
    status: () => 'disputed',
    // >= 2 so `refunded_at` falls strictly between `opened_at` and `as_of`.
    ageDays: (index, phase) => 2 + ((index + phase) % 359),
  },
  {
    name: 'disputed+unrefunded+age>30',
    count: 586,
    totalCents: 4_667_000,
    refunded: false,
    status: () => 'disputed',
    ageDays: (index, phase) => 31 + ((index + phase) % 330),
  },
  {
    name: 'disputed+unrefunded+age<=30',
    count: 7,
    totalCents: 84_000,
    refunded: false,
    status: () => 'disputed',
    ageDays: (index, phase) => 1 + ((index + phase) % 30),
  },
  {
    name: 'settled/open',
    count: 296,
    totalCents: 2_380_000,
    refunded: false,
    status: (index, phase) => ((index + phase) % 2 === 0 ? 'settled' : 'open'),
    ageDays: (index, phase) => 1 + ((index + phase) % 360),
  },
];

/** FNV-1a, 32-bit. A pure function of the seed string — the only place a seed is read. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function isoDay(daysBeforeAsOf: number): string {
  return new Date(AS_OF_EPOCH_MS - daysBeforeAsOf * MS_PER_DAY).toISOString().slice(0, 10);
}

function padded(prefix: string, value: number, width: number): string {
  return `${prefix}${String(value).padStart(width, '0')}`;
}

/**
 * `count` amounts drawn from `cycle` rotated by `rotation`, where the last one absorbs
 * whatever is needed to make the run total exactly `totalCents`.
 */
function cohortAmounts(
  cycle: readonly number[],
  count: number,
  totalCents: number,
  rotation: number,
  cohortName: string,
): number[] {
  const offset = rotation % cycle.length;
  const rotated = [...cycle.slice(offset), ...cycle.slice(0, offset)];

  const amounts: number[] = [];
  while (amounts.length < count - 1) {
    amounts.push(...rotated);
  }
  amounts.length = count - 1;

  const absorbing = totalCents - amounts.reduce((sum, amount) => sum + amount, 0);
  if (absorbing <= 0) {
    throw new Error(
      `cohort ${cohortName}: absorbing amount ${absorbing} is not positive — ` +
        `the amount cycle is too large for ${count} rows totalling ${totalCents} cents`,
    );
  }
  amounts.push(absorbing);
  return amounts;
}

/**
 * Build one ledger from its seed. Same seed ⇒ identical output, on every machine, forever
 * (FR-006, SC-002).
 */
export function generateLedger<Seed extends string>(seed: Seed): Ledger<Seed> {
  const hash = fnv1a(seed);
  const chargeRotation = hash % CHARGE_CYCLE.length;
  const payoutRotation = hash % PAYOUT_CYCLE.length;
  const customerOffset = hash % CUSTOMER_COUNT;
  const merchantOffset = hash % MERCHANT_COUNT;
  const agePhase = hash % AGE_PHASE_MODULUS;

  const charges: Charge[] = [];
  for (const cohort of COHORTS) {
    const amounts = cohortAmounts(
      CHARGE_CYCLE,
      cohort.count,
      cohort.totalCents,
      chargeRotation,
      cohort.name,
    );
    for (const [index, amount] of amounts.entries()) {
      const order = charges.length;
      const ageDays = cohort.ageDays(index, agePhase);
      charges.push({
        id: padded('chg_', order + 1, 6),
        customer_id: padded('cus_', ((order + customerOffset) % CUSTOMER_COUNT) + 1, 4),
        status: cohort.status(index, agePhase),
        amount_cents: amount,
        opened_at: isoDay(ageDays),
        age_days: ageDays,
        refunded: cohort.refunded,
        refunded_at: cohort.refunded ? isoDay(Math.floor(ageDays / 2)) : null,
      });
    }
  }

  const payouts: Payout[] = cohortAmounts(
    PAYOUT_CYCLE,
    PAYOUT_COUNT,
    PAYOUT_TOTAL_CENTS,
    payoutRotation,
    'payouts',
  ).map((amount, index) => ({
    id: padded('pay_', index + 1, 4),
    merchant_id: padded('mer_', ((index + merchantOffset) % MERCHANT_COUNT) + 1, 3),
    amount_cents: amount,
    payout_eligible: true,
  }));

  return { seed, as_of: AS_OF, charges, payouts };
}
