import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type Task from 'true-myth/task';
import * as task from 'true-myth/task';
import type { ShapeFailure } from './shape/outcome';

const run = promisify(execFile);

type GitExit = { readonly code: number; readonly stderr: string };

const isGitExit = (cause: unknown): cause is GitExit =>
  typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'number';

export const repoRoot = (cwd: string): Task<string, ShapeFailure> =>
  task.tryOrElse(
    (cause): ShapeFailure =>
      isGitExit(cause)
        ? { kind: 'NotARepository', cwd }
        : { kind: 'Unexpected', operation: 'repoRoot', cause },
    async () => (await run('git', ['rev-parse', '--show-toplevel'], { cwd })).stdout.trimEnd(),
  );

export const checkout = (root: string, branch: string): Task<void, ShapeFailure> =>
  task.tryOrElse(
    (cause): ShapeFailure =>
      isGitExit(cause)
        ? { kind: 'CheckoutFailed', branch, stderr: cause.stderr }
        : { kind: 'Unexpected', operation: 'checkout', cause },
    async () => {
      await run('git', ['switch', '--quiet', branch], { cwd: root });
    },
  );
