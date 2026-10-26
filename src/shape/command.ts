import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type Task from 'true-myth/task';
import * as task from 'true-myth/task';
import { checkout, repoRoot } from '../git';
import { newWorkUnit } from '../workunit/record';
import { slugFromBranch } from '../workunit/slug';
import { createWorkUnit } from '../workunit/store';
import { parseShapeArgs } from './args';
import { type Outcome, render, type ShapeFailure } from './outcome';

export type ShapeContext = {
  readonly cwd: ExtensionCommandContext['cwd'];
  readonly ui: Pick<ExtensionCommandContext['ui'], 'notify'>;
};

const adopt = (args: string, cwd: string, now: string): Task<Outcome, ShapeFailure> =>
  task.fromResult(parseShapeArgs(args)).andThen(({ branch }) =>
    repoRoot(cwd).andThen((root) =>
      task.fromResult(slugFromBranch(branch)).andThen((slug) =>
        checkout(root, branch)
          .andThen(() => createWorkUnit(root, newWorkUnit({ slug, branch, now })))
          .map((): Outcome => ({ kind: 'Created', slug, branch })),
      ),
    ),
  );

export const shape = async (args: string, ctx: ShapeContext): Promise<void> => {
  const outcome = (await adopt(args, ctx.cwd, new Date().toISOString())).match({
    Ok: (outcome) => outcome,
    Err: (failure) => {
      if (failure.kind === 'Unexpected') {
        const cause = failure.cause;
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`/shape: ${failure.operation}: ${message}`, { cause });
      }
      return failure;
    },
  });
  const { message, level } = render(outcome);
  ctx.ui.notify(message, level);
};
