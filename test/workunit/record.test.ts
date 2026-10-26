import { expect, test } from 'bun:test';
import Maybe from 'true-myth/maybe';
import { ok } from 'true-myth/result';
import { lastSessionFile, newWorkUnit, parseWorkUnit } from '../../src/workunit/record';
import type { Slug } from '../../src/workunit/slug';

test('a new work unit is created with no phase and empty collections', () => {
  const now = '2026-10-26T12:00:00.000Z';
  const slug = 'feat-x' as Slug;
  expect(newWorkUnit({ slug, branch: 'feat/x', now })).toEqual({
    slug,
    branch: 'feat/x',
    state: 'created',
    phase: 'none',
    retryCount: 0,
    artifacts: {},
    briefs: {},
    sessionFiles: [],
    createdAt: now,
    updatedAt: now,
  });
});

test('parseWorkUnit accepts a new work unit read back from JSON', () => {
  const record = newWorkUnit({
    slug: 'feat-x' as Slug,
    branch: 'feat/x',
    now: '2026-10-26T12:00:00.000Z',
  });
  expect(parseWorkUnit(JSON.parse(JSON.stringify(record)))).toEqual(ok(record));
});

test('lastSessionFile picks the last .jsonl name and skips other files', () => {
  const names = [
    '2999-01-01T00-00-00-000Z_late.jsonl',
    'pre-compact-2026-10-26T00-00-00-000Z.json',
    '2000-01-01T00-00-00-000Z_early.jsonl',
  ];
  expect(lastSessionFile(names)).toEqual(Maybe.just('2999-01-01T00-00-00-000Z_late.jsonl'));
});
