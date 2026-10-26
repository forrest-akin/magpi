import { expect, test } from 'bun:test';
import { newWorkUnit } from '../../src/workunit/record';
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
