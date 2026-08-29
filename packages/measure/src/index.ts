/**
 * `@crossexam/measure` — the `measure` server (research D-15).
 *
 * The Bench starts it in-process with `startMeasureServer` on
 * `CROSSEXAM_MEASURE_SERVER_URL`, holding only `CROSSEXAM_REPLICA_PATH` (data-model §12).
 */

export { startMeasureServer, type MeasureServerOptions } from './server.ts';
