import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as result from 'true-myth/result';
import type Task from 'true-myth/task';
import * as task from 'true-myth/task';
import type { ParseError } from '../parse';
import type { ShapeError, ShapeFailure } from '../shape/outcome';
import { parseWorkUnit, type WorkUnitRecord } from './record';

const errnoOf = (cause: unknown): unknown =>
  typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined;

export const unitDir = (root: string, slug: string): string => join(root, '.magpi/work', slug);

const writeFailed = (path: string, cause: unknown): ShapeError => ({
  kind: 'WriteFailed',
  path,
  code: String(errnoOf(cause)),
});

const replaceJson = async (file: string, record: WorkUnitRecord): Promise<void> => {
  await writeFile(`${file}.tmp`, `${JSON.stringify(record, null, 2)}\n`);
  await rename(`${file}.tmp`, file);
};

export const createWorkUnit = (root: string, record: WorkUnitRecord): Task<void, ShapeFailure> => {
  const dir = unitDir(root, record.slug);
  const file = join(dir, 'work.json');
  return task.tryOrElse(
    (cause): ShapeFailure =>
      errnoOf(cause) === 'EEXIST'
        ? { kind: 'AlreadyExists', slug: record.slug }
        : writeFailed(file, cause),
    async () => {
      await mkdir(dirname(dir), { recursive: true });
      await mkdir(dir);
      await replaceJson(file, record);
    },
  );
};

export type Lookup =
  | { readonly kind: 'Missing' }
  | { readonly kind: 'Orphaned' }
  | { readonly kind: 'Found'; readonly record: WorkUnitRecord };

type ReadError = { readonly kind: 'ReadError'; readonly cause: unknown };

const unexpected = (cause: unknown): ShapeFailure => ({
  kind: 'Unexpected',
  operation: 'readWorkUnit',
  cause,
});

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const firstIssue = ({ issues: [issue] }: ParseError): string => {
  if (issue === undefined) return '';
  return issue.path.length === 0 ? issue.message : `${issue.path.join('.')}: ${issue.message}`;
};

const absent = (dir: string, cause: unknown): Task<Lookup, ShapeFailure> =>
  errnoOf(cause) === 'ENOENT'
    ? task
        .tryOrElse(
          (cause) => cause,
          () => stat(dir),
        )
        .map((): Lookup => ({ kind: 'Orphaned' }))
        .orElse((cause) =>
          errnoOf(cause) === 'ENOENT'
            ? task.resolve<Lookup, ShapeFailure>({ kind: 'Missing' })
            : task.reject<Lookup, ShapeFailure>(unexpected(cause)),
        )
    : task.reject(unexpected(cause));

export const readWorkUnit = (root: string, slug: string): Task<Lookup, ShapeFailure> => {
  const dir = unitDir(root, slug);
  const file = join(dir, 'work.json');
  return task
    .tryOrElse(
      (cause): ReadError => ({ kind: 'ReadError', cause }),
      () => readFile(file, 'utf8'),
    )
    .andThen((text) =>
      task.fromResult(
        result
          .tryOrElse(
            (error): ShapeFailure => ({ kind: 'Corrupt', path: file, detail: messageOf(error) }),
            (): unknown => JSON.parse(text),
          )
          .andThen((json) =>
            parseWorkUnit(json).mapErr(
              (error): ShapeFailure => ({ kind: 'Corrupt', path: file, detail: firstIssue(error) }),
            ),
          ),
      ),
    )
    .map((record): Lookup => ({ kind: 'Found', record }))
    .orElse((error) =>
      error.kind === 'ReadError' ? absent(dir, error.cause) : task.reject(error),
    );
};
