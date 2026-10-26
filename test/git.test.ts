import { expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { err, ok } from 'true-myth/result';
import { checkout, repoRoot } from '../src/git';
import { git, tempDir, tempRepo } from './support/repo';

test('repoRoot finds the top level from a subdirectory', async () => {
  const root = await tempRepo();
  await mkdir(join(root, 'sub'));
  expect(await repoRoot(join(root, 'sub'))).toEqual(ok(root));
});

test('repoRoot outside a repository is NotARepository', async () => {
  const dir = await tempDir();
  expect(await repoRoot(dir)).toEqual(err({ kind: 'NotARepository', cwd: dir }));
});

test('repoRoot from a cwd that does not exist is Unexpected', async () => {
  const missing = join(await tempDir(), 'gone');
  const result = await repoRoot(missing);
  expect(result.isErr && result.error.kind).toBe('Unexpected');
});

test('checkout moves HEAD to an existing branch', async () => {
  const root = await tempRepo('feat/x');
  expect(await checkout(root, 'feat/x')).toEqual(ok(undefined));
  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('feat/x');
});

test('checkout of a missing branch is CheckoutFailed with git stderr', async () => {
  const root = await tempRepo();
  const result = await checkout(root, 'nope');
  expect(result).toEqual(
    err({
      kind: 'CheckoutFailed',
      branch: 'nope',
      stderr: 'fatal: invalid reference: nope\n',
    }),
  );
});

test('checkout from a root that does not exist is Unexpected', async () => {
  const missing = join(await tempDir(), 'gone');
  const result = await checkout(missing, 'main');
  expect(result.isErr && result.error.kind).toBe('Unexpected');
});
