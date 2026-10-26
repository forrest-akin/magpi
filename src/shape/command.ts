import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type Task from 'true-myth/task';
import * as task from 'true-myth/task';
import { checkout, currentBranch, repoRoot } from '../git';
import { newWorkUnit, type WorkUnitRecord } from '../workunit/record';
import { type Slug, slugFromBranch, suffixedSlug } from '../workunit/slug';
import { createWorkUnit, type Lookup, readWorkUnit, unitDir } from '../workunit/store';
import { parseShapeArgs } from './args';
import { type Outcome, render, type ShapeFailure } from './outcome';

export type ShapeContext = {
  readonly cwd: ExtensionCommandContext['cwd'];
  readonly ui: Pick<ExtensionCommandContext['ui'], 'notify'>;
};

const usage = (input: string): Task<Outcome, ShapeFailure> =>
  task.resolve({ kind: 'Usage', input });

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

const orphaned = (root: string, slug: Slug): Task<Outcome, ShapeFailure> =>
  task.reject({ kind: 'Orphaned', path: unitDir(root, slug) });

const reportAt = (root: string, args: string, place: Place): Task<Outcome, ShapeFailure> => {
  switch (place.kind) {
    case 'Mine':
      return task.resolve(status(place.slug, place.record));
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

const report = (args: string, root: string): Task<Outcome, ShapeFailure> =>
  currentBranch(root).andThen((branch) =>
    branch.isNothing
      ? usage(args)
      : task
          .fromResult(slugFromBranch(branch.value))
          .andThen((slug) =>
            locate(root, branch.value, slug).andThen((place) => reportAt(root, args, place)),
          ),
  );

const settle = (
  root: string,
  branch: string,
  now: string,
  place: Place,
): Task<Outcome, ShapeFailure> => {
  switch (place.kind) {
    case 'Mine':
      return checkout(root, branch).map(() => status(place.slug, place.record));
    case 'Missing':
      return checkout(root, branch)
        .andThen(() => createWorkUnit(root, newWorkUnit({ slug: place.slug, branch, now })))
        .map((): Outcome => ({ kind: 'Created', slug: place.slug, branch }));
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

const adopt = (root: string, branch: string, now: string): Task<Outcome, ShapeFailure> =>
  task
    .fromResult(slugFromBranch(branch))
    .andThen((slug) => locate(root, branch, slug))
    .andThen((place) => settle(root, branch, now, place));

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
