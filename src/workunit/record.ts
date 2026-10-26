import type { Result } from 'true-myth/result';
import * as z from 'zod';
import { type ParseError, parserFor } from '../parse';
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

const workUnitSchema = z.object({
  slug: z.string().transform((slug) => slug as Slug),
  branch: z.string(),
  state: z.literal('created'),
  phase: z.literal('none'),
  retryCount: z.literal(0),
  artifacts: z.strictObject({}),
  briefs: z.strictObject({}),
  sessionFiles: z.tuple([]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}) satisfies z.ZodType<WorkUnitRecord>;

export const parseWorkUnit: (input: unknown) => Result<WorkUnitRecord, ParseError> =
  parserFor(workUnitSchema);
