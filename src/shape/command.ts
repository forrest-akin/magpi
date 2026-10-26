import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import Maybe from 'true-myth/maybe';
import type Task from 'true-myth/task';
import * as task from 'true-myth/task';
import { checkout, currentBranch, repoRoot } from '../git';
import { newWorkUnit, type WorkUnitRecord } from '../workunit/record';
import { type Slug, slugFromBranch } from '../workunit/slug';
import { createWorkUnit, type Lookup, readWorkUnit } from '../workunit/store';
import { parseShapeArgs } from './args';
import { type Outcome, render, type ShapeFailure } from './outcome';

export type ShapeContext = {
  readonly cwd: ExtensionCommandContext['cwd'];
  readonly ui: Pick<ExtensionCommandContext['ui'], 'notify'>;
};

const usage = (input: string): Task<Outcome, ShapeFailure> =>
  task.resolve({ kind: 'Usage', input });

const ownUnit = (branch: string, lookup: Lookup): Maybe<WorkUnitRecord> =>
  lookup.kind === 'Found' && lookup.record.branch === branch
    ? Maybe.just(lookup.record)
    : Maybe.nothing();

const status = (slug: Slug, record: WorkUnitRecord): Outcome => ({
  kind: 'Status',
  slug,
  state: record.state,
  phase: record.phase,
});

const report = (args: string, root: string): Task<Outcome, ShapeFailure> =>
  currentBranch(root).andThen((branch) =>
    branch.isNothing
      ? usage(args)
      : task.fromResult(slugFromBranch(branch.value)).andThen((slug) =>
          readWorkUnit(root, slug).andThen((lookup) =>
            ownUnit(branch.value, lookup).match({
              Just: (record) => task.resolve<Outcome, ShapeFailure>(status(slug, record)),
              Nothing: () => usage(args),
            }),
          ),
        ),
  );

const adopt = (root: string, branch: string, now: string): Task<Outcome, ShapeFailure> =>
  task.fromResult(slugFromBranch(branch)).andThen((slug) =>
    readWorkUnit(root, slug).andThen((lookup) =>
      ownUnit(branch, lookup).match({
        Just: (record) => checkout(root, branch).map(() => status(slug, record)),
        Nothing: () =>
          checkout(root, branch)
            .andThen(() => createWorkUnit(root, newWorkUnit({ slug, branch, now })))
            .map((): Outcome => ({ kind: 'Created', slug, branch })),
      }),
    ),
  );

const run = (args: string, cwd: string, now: string): Task<Outcome, ShapeFailure> =>
  task
    .fromResult(parseShapeArgs(args))
    .andThen((request) =>
      repoRoot(cwd).andThen((root) =>
        request.kind === 'Report' ? report(args, root) : adopt(root, request.branch, now),
      ),
    );

export const shape = async (args: string, ctx: ShapeContext): Promise<void> => {
  const outcome = (await run(args, ctx.cwd, new Date().toISOString())).match({
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
