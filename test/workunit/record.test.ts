import { expect, test } from 'bun:test';
import { ok } from 'true-myth/result';
import { newWorkUnit, parseWorkUnit } from '../../src/workunit/record';
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
