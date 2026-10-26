import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { shape } from '../../src/shape/command';
import { git, tempDir, tempRepo } from '../support/repo';

const fakeCtx = (cwd: string) => {
  const notices: { message: string; level?: string }[] = [];
  const ctx = {
    cwd,
    ui: {
      notify: (message: string, level?: 'info' | 'warning' | 'error') => {
        notices.push({ message, level });
      },
    },
  };
  return { ctx, notices };
};

test.each(['', 'anything else'])('args %p notify the usage at error', async (args) => {
  const { ctx, notices } = fakeCtx(await tempRepo());
  await shape(args, ctx);
  expect(notices).toEqual([{ message: 'Usage: /shape --branch <branch>', level: 'error' }]);
});

test('--branch checks the branch out and creates its work unit', async () => {
  const root = await tempRepo('feat/x');
  const { ctx, notices } = fakeCtx(root);

  await shape('--branch feat/x', ctx);

  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('feat/x');
  const record = JSON.parse(await readFile(join(root, '.magpi/work/feat-x/work.json'), 'utf8'));
  expect(record.state).toBe('created');
  expect(notices).toEqual([
    { message: 'Work unit feat-x created on branch feat/x.', level: 'info' },
  ]);
});

test('outside a repository it notifies the cwd at error', async () => {
  const cwd = await tempDir();
  const { ctx, notices } = fakeCtx(cwd);

  await shape('--branch feat/x', ctx);

  expect(notices).toEqual([{ message: `Not in a git repository: ${cwd}`, level: 'error' }]);
});

test('a missing branch notifies git stderr at error and leaves HEAD in place', async () => {
  const root = await tempRepo();
  const { ctx, notices } = fakeCtx(root);

  await shape('--branch feat/x', ctx);

  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
  expect(notices).toEqual([{ message: 'fatal: invalid reference: feat/x', level: 'error' }]);
});

test('--branch whose slug is empty notifies InvalidSlug and leaves HEAD in place', async () => {
  const root = await tempRepo('!!');
  const { ctx, notices } = fakeCtx(root);

  await shape('--branch !!', ctx);

  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
  expect(notices).toEqual([{ message: 'Branch !! gives an empty slug.', level: 'error' }]);
});

test('--branch naming a tracked file is CheckoutFailed and keeps its edits', async () => {
  const root = await tempRepo();
  const readme = join(root, 'README.md');
  await writeFile(readme, 'v1\n');
  git(root, 'add', 'README.md');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'readme');
  await writeFile(readme, 'v2\n');
  const { ctx, notices } = fakeCtx(root);

  await shape('--branch README.md', ctx);

  expect(await readFile(readme, 'utf8')).toBe('v2\n');
  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
  expect(existsSync(join(root, '.magpi'))).toBe(false);
  expect(notices).toEqual([{ message: 'fatal: invalid reference: README.md', level: 'error' }]);
});

test('an existing work unit warns and leaves work.json untouched', async () => {
  const root = await tempRepo('feat/x');
  const workJson = join(root, '.magpi/work/feat-x/work.json');
  await shape('--branch feat/x', fakeCtx(root).ctx);
  const before = await readFile(workJson, 'utf8');
  const { ctx, notices } = fakeCtx(root);

  await shape('--branch feat/x', ctx);

  expect(await readFile(workJson, 'utf8')).toBe(before);
  expect(notices).toEqual([{ message: 'Work unit feat-x already exists.', level: 'warning' }]);
});

test('an unexpected failure throws naming the operation and its cause', async () => {
  const { ctx, notices } = fakeCtx(join(await tempDir(), 'missing'));

  const error = await shape('--branch feat/x', ctx).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(Error);
  const { message, cause } = error as Error;
  expect(cause).toBeInstanceOf(Error);
  expect(message).toBe(`/shape: repoRoot: ${(cause as Error).message}`);
  expect(notices).toEqual([]);
});
