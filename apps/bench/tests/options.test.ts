/**
 * `--guardrails-only` (T038).
 *
 * The flag is one `includes`, but it reaches the run through two levels of `pnpm run` and it
 * decides whether the Evaluator is consulted at all. What matters is that it does not match
 * loosely: only the exact flag may stop a run before anything is measured.
 */

import { describe, expect, it } from 'vitest';

import { parseOptions } from '../src/demo.ts';

describe('parseOptions', () => {
  it('is off unless the flag is given', () => {
    expect(parseOptions([]).guardrailsOnly).toBe(false);
    expect(parseOptions(['--scenario', 'unparseable']).guardrailsOnly).toBe(false);
  });

  it('is on for the exact flag, wherever it sits', () => {
    expect(parseOptions(['--guardrails-only']).guardrailsOnly).toBe(true);
    expect(parseOptions(['--scenario', 'over-threshold', '--guardrails-only']).guardrailsOnly).toBe(
      true,
    );
  });

  it('does not match a near miss', () => {
    expect(parseOptions(['--guardrails']).guardrailsOnly).toBe(false);
    expect(parseOptions(['--guardrails-only=true']).guardrailsOnly).toBe(false);
    expect(parseOptions(['guardrails-only']).guardrailsOnly).toBe(false);
  });

  it('reads --serve on its own', () => {
    expect(parseOptions(['--serve']).serve).toBe(true);
    expect(parseOptions(['--serve']).guardrailsOnly).toBe(false);
    expect(parseOptions([]).serve).toBe(false);
  });
});
