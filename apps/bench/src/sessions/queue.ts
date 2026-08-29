/**
 * Per-session FIFO turn queue — T023 (FR-003, research D-09).
 *
 * The harness cancels any running turn when a new one is created in the same session
 * (Risk R5), so the Bench never has two turns in flight for one `sessionId`. The SDK's
 * 60 s default timeout would abort a long SSE read and look like an agent bug (Risk R6);
 * 600 s is per request, reset on every turn.
 */

import { TrueForge } from '@truefoundry/trueforge-sdk';
import type { Config } from '@crossexam/core';

export function createHarnessClient(config: Config): TrueForge {
  return new TrueForge({ baseUrl: config.trueforge_base_url, timeoutInSeconds: 600 });
}

export class TurnQueue {
  private readonly tails = new Map<string, Promise<void>>();

  /** Run `turn` once every turn queued earlier for `sessionId` has settled. */
  run<T>(sessionId: string, turn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(sessionId) ?? Promise.resolve();
    const result = previous.then(turn);
    this.tails.set(
      sessionId,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }
}
