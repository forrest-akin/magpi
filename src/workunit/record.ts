import type { Slug } from './slug';

type Empty = Readonly<Record<string, never>>;

export type WorkUnitRecord = {
  readonly slug: Slug;
  readonly branch: string;
  readonly state: 'created';
  readonly phase: 'none';
  readonly retryCount: 0;
  readonly artifacts: Empty;
  readonly briefs: Empty;
  readonly sessionFiles: readonly [];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export const newWorkUnit = ({
  slug,
  branch,
  now,
}: {
  readonly slug: Slug;
  readonly branch: string;
  readonly now: string;
}): WorkUnitRecord => ({
  slug,
  branch,
  state: 'created',
  phase: 'none',
  retryCount: 0,
  artifacts: {},
  briefs: {},
  sessionFiles: [],
  createdAt: now,
  updatedAt: now,
});
