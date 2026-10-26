import { expect, test } from 'bun:test';
import { err, ok } from 'true-myth/result';
import { type Slug, slugFromBranch } from '../../src/workunit/slug';

test('feat/OAuth_login gives feat-oauth-login', () => {
  expect(slugFromBranch('feat/OAuth_login')).toEqual(ok('feat-oauth-login' as Slug));
});

test.each([
  ['a b', 'a-b'],
  ['fix:#12!', 'fix12'],
  ['x'.repeat(45), 'x'.repeat(40)],
])('%p gives %p', (branch, slug) => {
  expect(slugFromBranch(branch)).toEqual(ok(slug as Slug));
});

test('a branch with nothing slug-safe is an invalid slug', () => {
  expect(slugFromBranch('!!')).toEqual(err({ kind: 'InvalidSlug', branch: '!!' }));
});
