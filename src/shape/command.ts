import { randomUUID } from 'node:crypto';
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import Maybe from 'true-myth/maybe';
import type Task from 'true-myth/task';
import * as task from 'true-myth/task';
import { checkout, currentBranch, repoRoot } from '../git';
import {
  type CreatedRecord,
  isCreated,
  newWorkUnit,
  sessionFileName,
  startShaping,
  type WorkUnitRecord,
} from '../workunit/record';
import { type Slug, slugFromBranch, suffixedSlug } from '../workunit/slug';
import {
  createSessionFile,
  createWorkUnit,
  type Lookup,
  readWorkUnit,
  unitDir,
  writeWorkUnit,
} from '../workunit/store';
import { parseShapeArgs } from './args';
import { type Outcome, render, type ShapeFailure, type Unexpected } from './outcome';

type Notifier = { readonly ui: Pick<ExtensionCommandContext['ui'], 'notify'> };

export type ShapeContext = Notifier & {
  readonly cwd: ExtensionCommandContext['cwd'];
  readonly switchSession: (
    sessionPath: string,
    options: { readonly withSession: (ctx: Notifier) => Promise<void> },
  ) => Promise<{ readonly cancelled: boolean }>;
};

type Stamp = { readonly now: string; readonly uuid: string };

type Step =
  | { readonly kind: 'Notify'; readonly outcome: Outcome }
  | {
      readonly kind: 'Switch';
      readonly root: string;
      readonly sessionPath: string;
      readonly record: WorkUnitRecord;
      readonly outcome: Outcome;
    };

const notice = (outcome: Outcome): Step => ({ kind: 'Notify', outcome });

const usage = (input: string): Task<Step, ShapeFailure> =>
  task.resolve(notice({ kind: 'Usage', input }));

type Place =
  | { readonly kind: 'Mine'; readonly slug: Slug; readonly record: WorkUnitRecord }
  | { readonly kind: 'Missing'; readonly slug: Slug }
  | { readonly kind: 'Orphaned'; readonly slug: Slug }
  | { readonly kind: 'Taken'; readonly slug: Slug; readonly branch: string };

const placeAt = (slug: Slug, branch: string, lookup: Lookup): Place => {
  if (lookup.kind !== 'Found') return { kind: lookup.kind, slug };
  return lookup.record.branch === branch
    ? { kind: 'Mine', slug, record: lookup.record }
    : { kind: 'Taken', slug, branch: lookup.record.branch };
};

const locate = (root: string, branch: string, slug: Slug): Task<Place, ShapeFailure> =>
  readWorkUnit(root, slug).andThen((lookup) => {
    const place = placeAt(slug, branch, lookup);
    const suffixed = suffixedSlug(slug, branch);
    return place.kind === 'Taken'
      ? readWorkUnit(root, suffixed).map((next) => placeAt(suffixed, branch, next))
      : task.resolve(place);
  });

const status = (slug: Slug, record: WorkUnitRecord): Outcome => ({
  kind: 'Status',
  slug,
  state: record.state,
  phase: record.phase,
});

const orphaned = (root: string, slug: Slug): Task<Step, ShapeFailure> =>
  task.reject({ kind: 'Orphaned', path: unitDir(root, slug) });

const reportAt = (
  root: string,
  args: string,
  stamp: Stamp,
  place: Place,
): Task<Step, ShapeFailure> => {
  switch (place.kind) {
    case 'Mine':
      return enter(root, stamp, place.slug, place.record);
    case 'Orphaned':
      return orphaned(root, place.slug);
    case 'Missing':
    case 'Taken':
      return usage(args);
    default: {
      const unhandled: never = place;
      return unhandled;
    }
  }
};

const report = (args: string, root: string, stamp: Stamp): Task<Step, ShapeFailure> =>
  currentBranch(root).andThen((branch) =>
    branch.isNothing
      ? usage(args)
      : task
          .fromResult(slugFromBranch(branch.value))
          .andThen((slug) =>
            locate(root, branch.value, slug).andThen((place) => reportAt(root, args, stamp, place)),
          ),
  );

const startSession = (
  root: string,
  record: CreatedRecord,
  { now, uuid }: Stamp,
  outcomeOf: (shaped: WorkUnitRecord) => Outcome,
): Task<Step, ShapeFailure> => {
  const name = sessionFileName(now, uuid);
  const shaped = startShaping(record, `sessions/${name}`, now);
  return createSessionFile(root, record.slug, name).map(
    (sessionPath): Step => ({
      kind: 'Switch',
      root,
      sessionPath,
      record: shaped,
      outcome: outcomeOf(shaped),
    }),
  );
};

const enter = (
  root: string,
  stamp: Stamp,
  slug: Slug,
  record: WorkUnitRecord,
): Task<Step, ShapeFailure> =>
  isCreated(record)
    ? startSession(root, record, stamp, (shaped) => status(slug, shaped))
    : task.resolve(notice(status(slug, record)));

const settle = (
  root: string,
  branch: string,
  stamp: Stamp,
  place: Place,
): Task<Step, ShapeFailure> => {
  switch (place.kind) {
    case 'Mine':
      return checkout(root, branch).andThen(() => enter(root, stamp, place.slug, place.record));
    case 'Missing': {
      const record = newWorkUnit({ slug: place.slug, branch, now: stamp.now });
      return checkout(root, branch)
        .andThen(() => createWorkUnit(root, record))
        .andThen(() =>
          startSession(root, record, stamp, () => ({ kind: 'Created', slug: place.slug, branch })),
        );
    }
    case 'Orphaned':
      return orphaned(root, place.slug);
    case 'Taken':
      return task.reject({ kind: 'SlugTaken', slug: place.slug, branch: place.branch });
    default: {
      const unhandled: never = place;
      return unhandled;
    }
  }
};

const adopt = (root: string, branch: string, stamp: Stamp): Task<Step, ShapeFailure> =>
  task
    .fromResult(slugFromBranch(branch))
    .andThen((slug) => locate(root, branch, slug))
    .andThen((place) => settle(root, branch, stamp, place));

const plan = (args: string, cwd: string, stamp: Stamp): Task<Step, ShapeFailure> =>
  task
    .fromResult(parseShapeArgs(args))
    .andThen((request) =>
      repoRoot(cwd).andThen((root) =>
        request.kind === 'Report' ? report(args, root, stamp) : adopt(root, request.branch, stamp),
      ),
    );

const notify = (ctx: Notifier, outcome: Outcome): void => {
  const { message, level } = render(outcome);
  ctx.ui.notify(message, level);
};

const switchInto = (
  ctx: ShapeContext,
  step: Extract<Step, { kind: 'Switch' }>,
): Task<Maybe<Outcome>, ShapeFailure> =>
  task
    .tryOrElse(
      (cause): ShapeFailure => ({ kind: 'Unexpected', operation: 'switchSession', cause }),
      () =>
        ctx.switchSession(step.sessionPath, {
          withSession: async (next) => {
            const written = await writeWorkUnit(step.root, step.record);
            notify(next, written.match({ Ok: () => step.outcome, Err: (error) => error }));
          },
        }),
    )
    .map(({ cancelled }) =>
      cancelled
        ? Maybe.just<Outcome>({ kind: 'SwitchCancelled', slug: step.record.slug })
        : Maybe.nothing<Outcome>(),
    );

const raise = ({ operation, cause }: Unexpected): never => {
  const message = cause instanceof Error ? cause.message : String(cause);
  throw new Error(`/shape: ${operation}: ${message}`, { cause });
};

export const shape = async (args: string, ctx: ShapeContext): Promise<void> => {
  const stamp = { now: new Date().toISOString(), uuid: randomUUID() };
  const result = await plan(args, ctx.cwd, stamp).andThen((step) =>
    step.kind === 'Switch' ? switchInto(ctx, step) : task.resolve(Maybe.just(step.outcome)),
  );
  result.match({
    Ok: (outcome) => {
      if (outcome.isJust) notify(ctx, outcome.value);
    },
    Err: (failure) => (failure.kind === 'Unexpected' ? raise(failure) : notify(ctx, failure)),
  });
};
