/**
 * How many cases the student app has: one per JSON file in src/content/cases.
 * Eleven are built in; `npm run add-case` adds more, so the tests count them.
 */
import { readdirSync } from 'node:fs';

export const CASE_COUNT = readdirSync(new URL('../../src/content/cases/', import.meta.url)).filter(
  (f) => f.endsWith('.json'),
).length;
