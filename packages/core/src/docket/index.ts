/**
 * The docket — what the system remembers across sessions (FR-021, data-model §11).
 *
 * One JSON line per verdict, appended to `.crossexam/docket.jsonl`, never rewritten. A
 * later session asks "what was decided on this action before" with `query()`; the entry
 * carries the full `Verdict` so the cited evidence comes back with the decision.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { ActionName, Verdict } from '../model/case.ts';

export const DOCKET_PATH = '.crossexam/docket.jsonl';

export interface DocketEntry {
  case_id: string;
  /** ISO timestamp. */
  recorded_at: string;
  action: ActionName;
  criteria: string;
  verdict: Verdict;
}

/** Appends one entry as one JSON line, creating the file and its directory on first use. */
export async function record(entry: DocketEntry, path = DOCKET_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(entry)}\n`);
}

/** Returns every recorded entry for `action`, oldest first; empty when no docket exists. */
export async function query(action: ActionName, path = DOCKET_PATH): Promise<DocketEntry[]> {
  const text = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as DocketEntry)
    .filter((entry) => entry.action === action);
}
