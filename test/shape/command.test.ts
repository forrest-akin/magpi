import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { shape } from '../../src/shape/command';
import { newWorkUnit } from '../../src/workunit/record';
import type { Slug } from '../../src/workunit/slug';
import { git, tempDir, tempRepo } from '../support/repo';

type Notifier = {
  ui: { notify: (message: string, level?: 'info' | 'warning' | 'error') => void };
};

const fakeCtx = (
  cwd: string,
  {
    cancelled = false,
    onSwitch = async () => {},
    sessionFile,
  }: { cancelled?: boolean; onSwitch?: () => Promise<void>; sessionFile?: string } = {},
) => {
  const notices: { message: string; level?: string }[] = [];
  const switches: string[] = [];
  const notifier = (stale: () => boolean): Notifier => ({
    ui: {
      notify: (message, level) => {
        if (stale()) throw new Error('stale ctx: the session was replaced');
        notices.push({ message, level });
      },
    },
  });
  const ctx = {
    cwd,
    sessionManager: { getSessionFile: () => sessionFile },
    ...notifier(() => switches.length > 0 && !cancelled),
    switchSession: async (
      path: string,
      { withSession }: { withSession: (ctx: Notifier) => Promise<void> },
    ) => {
      switches.push(path);
      if (cancelled) return { cancelled: true };
      await onSwitch();
      await withSession(notifier(() => false));
      return { cancelled: false };
    },
  };
  return { ctx, notices, switches };
};

test.each(['', 'anything else'])('args %p notify the usage at error', async (args) => {
  const { ctx, notices } = fakeCtx(await tempRepo());
  await shape(args, ctx);
  expect(notices).toEqual([{ message: 'Usage: /shape --branch <branch>', level: 'error' }]);
});

test('--branch on a new unit switches into a new session file in its sessions dir', async () => {
  const root = await tempRepo('feat/x');
  const { ctx, notices, switches } = fakeCtx(root);

  await shape('--branch feat/x', ctx);

  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('feat/x');
  const sessions = join(root, '.magpi/work/feat-x/sessions');
  const names = await readdir(sessions);
  expect(names).toHaveLength(1);
  const name = names[0] ?? '';
  expect(name).toMatch(/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z_[0-9a-f-]{36}\.jsonl$/);
  expect(await readFile(join(sessions, name), 'utf8')).toBe('');
  expect(switches).toEqual([join(sessions, name)]);
  const record = JSON.parse(await readFile(join(root, '.magpi/work/feat-x/work.json'), 'utf8'));
  expect(record).toMatchObject({
    state: 'shaping',
    phase: 'explore',
    sessionFiles: [`sessions/${name}`],
  });
  expect(record.updatedAt).toBe(record.createdAt);
  expect(notices).toEqual([
    { message: 'Work unit feat-x created on branch feat/x.', level: 'info' },
  ]);
});

test('--branch on a created unit switches into a new session file and reports it', async () => {
  const root = await tempRepo('feat/x');
  const dir = join(root, '.magpi/work/feat-x');
  const createdAt = '2026-01-01T00:00:00.000Z';
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'work.json'),
    JSON.stringify(newWorkUnit({ slug: 'feat-x' as Slug, branch: 'feat/x', now: createdAt })),
  );
  const { ctx, notices, switches } = fakeCtx(root);

  await shape('--branch feat/x', ctx);

  const names = await readdir(join(dir, 'sessions'));
  expect(names).toHaveLength(1);
  expect(switches).toEqual(names.map((name) => join(dir, 'sessions', name)));
  const record = JSON.parse(await readFile(join(dir, 'work.json'), 'utf8'));
  expect(record).toMatchObject({
    state: 'shaping',
    phase: 'explore',
    sessionFiles: names.map((name) => `sessions/${name}`),
    createdAt,
  });
  expect(record.updatedAt).not.toBe(createdAt);
  expect(notices).toEqual([{ message: 'Work unit feat-x: shaping (explore).', level: 'info' }]);
});

test('no args on a created unit switch into a new session file and report it', async () => {
  const root = await tempRepo('feat/x');
  git(root, 'checkout', '--quiet', 'feat/x');
  const dir = join(root, '.magpi/work/feat-x');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'work.json'),
    JSON.stringify(
      newWorkUnit({ slug: 'feat-x' as Slug, branch: 'feat/x', now: '2026-01-01T00:00:00.000Z' }),
    ),
  );
  const { ctx, notices, switches } = fakeCtx(root);

  await shape('', ctx);

  const names = await readdir(join(dir, 'sessions'));
  expect(names).toHaveLength(1);
  expect(switches).toEqual(names.map((name) => join(dir, 'sessions', name)));
  const record = JSON.parse(await readFile(join(dir, 'work.json'), 'utf8'));
  expect(record).toMatchObject({
    state: 'shaping',
    phase: 'explore',
    sessionFiles: names.map((name) => `sessions/${name}`),
  });
  expect(notices).toEqual([{ message: 'Work unit feat-x: shaping (explore).', level: 'info' }]);
});

test('a cancelled switch leaves the unit created and warns through the first ctx', async () => {
  const root = await tempRepo('feat/x');
  const { ctx, notices, switches } = fakeCtx(root, { cancelled: true });

  await shape('--branch feat/x', ctx);

  expect(switches).toHaveLength(1);
  const record = JSON.parse(await readFile(join(root, '.magpi/work/feat-x/work.json'), 'utf8'));
  expect(record).toMatchObject({ state: 'created', phase: 'none', sessionFiles: [] });
  expect(notices).toEqual([
    { message: "Switch to work unit feat-x's session cancelled.", level: 'warning' },
  ]);
});

test('a cancelled resume warns naming the unit and leaves work.json unchanged', async () => {
  const root = await tempRepo('feat/x');
  await shape('--branch feat/x', fakeCtx(root).ctx);
  const file = join(root, '.magpi/work/feat-x/work.json');
  const before = await readFile(file, 'utf8');
  const { ctx, notices, switches } = fakeCtx(root, { cancelled: true });

  await shape('', ctx);

  expect(switches).toHaveLength(1);
  expect(await readFile(file, 'utf8')).toBe(before);
  expect(notices).toEqual([
    { message: "Switch to work unit feat-x's session cancelled.", level: 'warning' },
  ]);
});

test('a failed work.json write after the switch notifies WriteFailed in the new session', async () => {
  const root = await tempRepo('feat/x');
  const dir = join(root, '.magpi/work/feat-x');
  const { ctx, notices, switches } = fakeCtx(root, { onSwitch: () => chmod(dir, 0o555) });

  await shape('--branch feat/x', ctx);

  expect(switches).toHaveLength(1);
  expect(JSON.parse(await readFile(join(dir, 'work.json'), 'utf8')).state).toBe('created');
  expect(notices).toEqual([
    { message: `Could not write ${join(dir, 'work.json')}: EACCES`, level: 'error' },
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

test('--branch on a shaping work unit checks it out and resumes it, work.json untouched', async () => {
  const root = await tempRepo('feat/x');
  const workJson = join(root, '.magpi/work/feat-x/work.json');
  const first = fakeCtx(root);
  await shape('--branch feat/x', first.ctx);
  const before = await readFile(workJson, 'utf8');
  git(root, 'checkout', '--quiet', 'main');
  const { ctx, notices, switches } = fakeCtx(root);

  await shape('--branch feat/x', ctx);

  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('feat/x');
  expect(await readFile(workJson, 'utf8')).toBe(before);
  expect(switches).toEqual(first.switches);
  expect(notices).toEqual([
    { message: 'Resumed work unit feat-x (shaping, explore).', level: 'info' },
  ]);
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

test("no args in the unit's last session report it without a switch", async () => {
  const root = await tempRepo('feat/x');
  const first = fakeCtx(root);
  await shape('--branch feat/x', first.ctx);
  const { ctx, notices, switches } = fakeCtx(root, { sessionFile: first.switches[0] });

  await shape('', ctx);

  expect(switches).toEqual([]);
  expect(notices).toEqual([{ message: 'Work unit feat-x: shaping (explore).', level: 'info' }]);
});

const unitOnFeatX = async (): Promise<{ root: string; workJson: string }> => {
  const root = await tempRepo('feat/x');
  await shape('--branch feat/x', fakeCtx(root).ctx);
  git(root, 'checkout', '--quiet', 'main');
  return { root, workJson: join(root, '.magpi/work/feat-x/work.json') };
};

test('--branch on a work.json failing the schema notifies Corrupt and leaves HEAD', async () => {
  const { root, workJson } = await unitOnFeatX();
  const record = JSON.parse(await readFile(workJson, 'utf8'));
  await writeFile(workJson, JSON.stringify({ ...record, state: 'bogus' }));
  const { ctx, notices } = fakeCtx(root);

  await shape('--branch feat/x', ctx);

  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
  expect(notices).toEqual([
    {
      message: `${workJson} is corrupt: state: Invalid option: expected one of "created"|"shaping"`,
      level: 'error',
    },
  ]);
});

test('--branch on a work.json that is not JSON notifies Corrupt and leaves HEAD', async () => {
  const { root, workJson } = await unitOnFeatX();
  await writeFile(workJson, '{');
  const detail = await Promise.resolve()
    .then(() => JSON.parse('{'))
    .catch((error: SyntaxError) => error.message);
  const { ctx, notices } = fakeCtx(root);

  await shape('--branch feat/x', ctx);

  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
  expect(notices).toEqual([{ message: `${workJson} is corrupt: ${detail}`, level: 'error' }]);
});

test('--branch on an unreadable work.json throws naming readWorkUnit', async () => {
  const { root, workJson } = await unitOnFeatX();
  await chmod(workJson, 0o000);
  const { ctx, notices } = fakeCtx(root);

  const error = await shape('--branch feat/x', ctx).catch((e: unknown) => e);

  expect((error as Error).message).toStartWith('/shape: readWorkUnit: EACCES');
  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
  expect(notices).toEqual([]);
});

test('no args on a detached HEAD notify the usage', async () => {
  const root = await tempRepo();
  git(root, 'checkout', '--quiet', '--detach');
  const { ctx, notices } = fakeCtx(root);

  await shape('', ctx);

  expect(notices).toEqual([{ message: 'Usage: /shape --branch <branch>', level: 'error' }]);
});

test("--branch whose slug holds another branch's unit creates it at <slug>-<crc>", async () => {
  const root = await tempRepo('feat/x', 'feat-x');
  await shape('--branch feat/x', fakeCtx(root).ctx);
  const { ctx, notices } = fakeCtx(root);

  await shape('--branch feat-x', ctx);

  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('feat-x');
  const record = JSON.parse(
    await readFile(join(root, '.magpi/work/feat-x-902b/work.json'), 'utf8'),
  );
  expect(record).toMatchObject({ slug: 'feat-x-902b', branch: 'feat-x' });
  expect(notices).toEqual([
    { message: 'Work unit feat-x-902b created on branch feat-x.', level: 'info' },
  ]);
});

test('--branch on a unit folder without work.json notifies Orphaned and leaves it all', async () => {
  const root = await tempRepo('feat/x');
  const dir = join(root, '.magpi/work/feat-x');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'work.json.tmp'), '{');
  const { ctx, notices, switches } = fakeCtx(root);

  await shape('--branch feat/x', ctx);

  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
  expect(await readdir(dir)).toEqual(['work.json.tmp']);
  expect(switches).toEqual([]);
  expect(notices).toEqual([
    {
      message: `Work unit folder ${dir} has no work.json; restore it or remove the folder.`,
      level: 'error',
    },
  ]);
});

test('no args on a unit folder without work.json notify Orphaned and leave it', async () => {
  const root = await tempRepo('feat/x');
  git(root, 'checkout', '--quiet', 'feat/x');
  const dir = join(root, '.magpi/work/feat-x');
  await mkdir(dir, { recursive: true });
  const { ctx, notices } = fakeCtx(root);

  await shape('', ctx);

  expect(await readdir(dir)).toEqual([]);
  expect(notices).toEqual([
    {
      message: `Work unit folder ${dir} has no work.json; restore it or remove the folder.`,
      level: 'error',
    },
  ]);
});

test("--branch when <slug> and <slug>-<crc> hold other branches' units is SlugTaken", async () => {
  const root = await tempRepo('feat/x', 'feat-x');
  await shape('--branch feat/x', fakeCtx(root).ctx);
  git(root, 'checkout', '--quiet', 'main');
  const record = JSON.parse(await readFile(join(root, '.magpi/work/feat-x/work.json'), 'utf8'));
  const suffixedJson = join(root, '.magpi/work/feat-x-902b/work.json');
  await mkdir(join(root, '.magpi/work/feat-x-902b'));
  await writeFile(
    suffixedJson,
    JSON.stringify({ ...record, slug: 'feat-x-902b', branch: 'feat_x' }),
  );
  const before = await readFile(suffixedJson, 'utf8');
  const { ctx, notices } = fakeCtx(root);

  await shape('--branch feat-x', ctx);

  expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
  expect(await readFile(suffixedJson, 'utf8')).toBe(before);
  expect(notices).toEqual([
    {
      message: 'Work unit feat-x-902b belongs to branch feat_x; rename this branch to adopt it.',
      level: 'error',
    },
  ]);
});

test('no args find the current branch unit at <slug>-<crc>', async () => {
  const root = await tempRepo('feat/x', 'feat-x');
  await shape('--branch feat/x', fakeCtx(root).ctx);
  const second = fakeCtx(root);
  await shape('--branch feat-x', second.ctx);
  const { ctx, notices } = fakeCtx(root, { sessionFile: second.switches[0] });

  await shape('', ctx);

  expect(notices).toEqual([
    { message: 'Work unit feat-x-902b: shaping (explore).', level: 'info' },
  ]);
});

test('no args on a shaping unit resume its last session file by name, work.json untouched', async () => {
  const root = await tempRepo('feat/x');
  await shape('--branch feat/x', fakeCtx(root).ctx);
  const dir = join(root, '.magpi/work/feat-x');
  const late = join(dir, 'sessions/2999-01-01T00-00-00-000Z_late.jsonl');
  await writeFile(late, '');
  await writeFile(join(dir, 'sessions/2000-01-01T00-00-00-000Z_early.jsonl'), '');
  const before = await readFile(join(dir, 'work.json'), 'utf8');
  const { ctx, notices, switches } = fakeCtx(root);

  await shape('', ctx);

  expect(switches).toEqual([late]);
  expect(await readFile(join(dir, 'work.json'), 'utf8')).toBe(before);
  expect(notices).toEqual([
    { message: 'Resumed work unit feat-x (shaping, explore).', level: 'info' },
  ]);
});

test('no args on a shaping unit with an empty sessions dir start a new session file', async () => {
  const root = await tempRepo('feat/x');
  git(root, 'checkout', '--quiet', 'feat/x');
  const dir = join(root, '.magpi/work/feat-x');
  const createdAt = '2026-01-01T00:00:00.000Z';
  const created = newWorkUnit({ slug: 'feat-x' as Slug, branch: 'feat/x', now: createdAt });
  const shaping = {
    ...created,
    state: 'shaping',
    phase: 'explore',
    sessionFiles: ['sessions/a.jsonl'],
  };
  await mkdir(join(dir, 'sessions'), { recursive: true });
  await writeFile(join(dir, 'work.json'), JSON.stringify(shaping));
  const { ctx, notices, switches } = fakeCtx(root);

  await shape('', ctx);

  const names = await readdir(join(dir, 'sessions'));
  expect(names).toHaveLength(1);
  expect(switches).toEqual(names.map((name) => join(dir, 'sessions', name)));
  const record = JSON.parse(await readFile(join(dir, 'work.json'), 'utf8'));
  expect(record).toMatchObject({
    state: 'shaping',
    phase: 'explore',
    sessionFiles: ['sessions/a.jsonl', ...names.map((name) => `sessions/${name}`)],
    createdAt,
  });
  expect(record.updatedAt).not.toBe(createdAt);
  expect(notices).toEqual([
    { message: 'Resumed work unit feat-x (shaping, explore).', level: 'info' },
  ]);
});

test('no args on a shaping unit without a sessions dir start a new session file', async () => {
  const root = await tempRepo('feat/x');
  git(root, 'checkout', '--quiet', 'feat/x');
  const dir = join(root, '.magpi/work/feat-x');
  const created = newWorkUnit({
    slug: 'feat-x' as Slug,
    branch: 'feat/x',
    now: '2026-01-01T00:00:00.000Z',
  });
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'work.json'),
    JSON.stringify({ ...created, state: 'shaping', phase: 'explore' }),
  );
  const { ctx, notices, switches } = fakeCtx(root);

  await shape('', ctx);

  const names = await readdir(join(dir, 'sessions'));
  expect(names).toHaveLength(1);
  expect(switches).toEqual(names.map((name) => join(dir, 'sessions', name)));
  expect(notices).toEqual([
    { message: 'Resumed work unit feat-x (shaping, explore).', level: 'info' },
  ]);
});

test("no args on a shaping unit resume a file holding only pi's session header", async () => {
  const root = await tempRepo('feat/x');
  const first = fakeCtx(root);
  await shape('--branch feat/x', first.ctx);
  const [sessionPath = ''] = first.switches;
  await writeFile(
    sessionPath,
    '{"type":"session","version":3,"id":"x","timestamp":"t","cwd":"c"}\n',
  );
  const { ctx, notices, switches } = fakeCtx(root);

  await shape('', ctx);

  expect(switches).toEqual([sessionPath]);
  expect(notices).toEqual([
    { message: 'Resumed work unit feat-x (shaping, explore).', level: 'info' },
  ]);
});
