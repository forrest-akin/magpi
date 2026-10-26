import { expect, test } from 'bun:test';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { err, ok } from 'true-myth/result';
import { newWorkUnit } from '../../src/workunit/record';
import type { Slug } from '../../src/workunit/slug';
import { createWorkUnit, readWorkUnit } from '../../src/workunit/store';
import { tempDir } from '../support/repo';

const record = newWorkUnit({
  slug: 'feat-x' as Slug,
  branch: 'feat/x',
  now: '2026-10-26T12:00:00.000Z',
});

test('createWorkUnit writes work.json as 2-space JSON with a trailing newline', async () => {
  const root = await tempDir();
  expect(await createWorkUnit(root, record)).toEqual(ok(undefined));
  const dir = join(root, '.magpi/work/feat-x');
  expect(await readFile(join(dir, 'work.json'), 'utf8')).toBe(
    `${JSON.stringify(record, null, 2)}\n`,
  );
  expect(await readdir(dir)).toEqual(['work.json']);
});

test('createWorkUnit leaves an existing work.json byte-identical and is AlreadyExists', async () => {
  const root = await tempDir();
  const file = join(root, '.magpi/work/feat-x/work.json');
  await mkdir(join(root, '.magpi/work/feat-x'), { recursive: true });
  await writeFile(file, 'existing');
  expect(await createWorkUnit(root, record)).toEqual(
    err({ kind: 'AlreadyExists', slug: 'feat-x' }),
  );
  expect(await readFile(file, 'utf8')).toBe('existing');
});

test('createWorkUnit with .magpi a regular file is WriteFailed naming work.json', async () => {
  const root = await tempDir();
  await writeFile(join(root, '.magpi'), '');
  expect(await createWorkUnit(root, record)).toEqual(
    err({ kind: 'WriteFailed', path: join(root, '.magpi/work/feat-x/work.json'), code: 'ENOTDIR' }),
  );
});

test('readWorkUnit finds a work unit createWorkUnit wrote', async () => {
  const root = await tempDir();
  await createWorkUnit(root, record);
  expect(await readWorkUnit(root, record.slug)).toEqual(ok({ kind: 'Found', record }));
});

test('readWorkUnit with no unit folder is Missing', async () => {
  expect(await readWorkUnit(await tempDir(), 'feat-x')).toEqual(ok({ kind: 'Missing' }));
});

test('readWorkUnit with a unit folder but no work.json is Orphaned', async () => {
  const root = await tempDir();
  await mkdir(join(root, '.magpi/work/feat-x'), { recursive: true });
  await writeFile(join(root, '.magpi/work/feat-x/work.json.tmp'), '{}');
  expect(await readWorkUnit(root, 'feat-x')).toEqual(ok({ kind: 'Orphaned' }));
});

test('readWorkUnit with a work.json failing the schema is Corrupt with the first issue', async () => {
  const root = await tempDir();
  const file = join(root, '.magpi/work/feat-x/work.json');
  await createWorkUnit(root, record);
  await writeFile(file, JSON.stringify({ ...record, state: 'bogus' }));
  expect(await readWorkUnit(root, 'feat-x')).toEqual(
    err({
      kind: 'Corrupt',
      path: file,
      detail: 'state: Invalid option: expected one of "created"|"shaping"',
    }),
  );
});

test('readWorkUnit with a work.json that is not JSON is Corrupt with the SyntaxError message', async () => {
  const root = await tempDir();
  const file = join(root, '.magpi/work/feat-x/work.json');
  await createWorkUnit(root, record);
  await writeFile(file, '{');
  const detail = (() => {
    try {
      JSON.parse('{');
    } catch (error) {
      return (error as SyntaxError).message;
    }
    return '';
  })();
  expect(await readWorkUnit(root, 'feat-x')).toEqual(err({ kind: 'Corrupt', path: file, detail }));
});

test('readWorkUnit with a null work.json is Corrupt with the root issue unprefixed', async () => {
  const root = await tempDir();
  const file = join(root, '.magpi/work/feat-x/work.json');
  await createWorkUnit(root, record);
  await writeFile(file, 'null');
  expect(await readWorkUnit(root, 'feat-x')).toEqual(
    err({ kind: 'Corrupt', path: file, detail: 'Invalid input: expected object, received null' }),
  );
});
