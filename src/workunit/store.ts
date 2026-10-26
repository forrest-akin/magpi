import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type Task from 'true-myth/task';
import * as task from 'true-myth/task';
import type { ShapeFailure } from '../shape/outcome';
import type { WorkUnitRecord } from './record';

const errnoOf = (cause: unknown): unknown =>
  typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined;

const unitDir = (root: string, slug: string): string => join(root, '.magpi/work', slug);

export const createWorkUnit = (root: string, record: WorkUnitRecord): Task<void, ShapeFailure> => {
  const dir = unitDir(root, record.slug);
  const file = join(dir, 'work.json');
  return task.tryOrElse(
    (cause): ShapeFailure =>
      errnoOf(cause) === 'EEXIST'
        ? { kind: 'AlreadyExists', slug: record.slug }
        : { kind: 'WriteFailed', path: file, code: String(errnoOf(cause)) },
    async () => {
      await mkdir(dirname(dir), { recursive: true });
      await mkdir(dir);
      await writeFile(`${file}.tmp`, `${JSON.stringify(record, null, 2)}\n`);
      await rename(`${file}.tmp`, file);
    },
  );
};
