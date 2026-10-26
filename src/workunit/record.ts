import type { Result } from 'true-myth/result';
import * as z from 'zod';
import { type ParseError, parserFor } from '../parse';
import type { Slug } from './slug';

type Empty = Readonly<Record<string, never>>;

export type WorkUnitRecord = {
  readonly slug: Slug;
  readonly branch: string;
  readonly state: 'created' | 'shaping';
  readonly phase: 'none' | 'explore';
  readonly retryCount: 0;
  readonly artifacts: Empty;
  readonly briefs: Empty;
  readonly sessionFiles: readonly string[];
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
}): CreatedRecord => ({
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

export type CreatedRecord = WorkUnitRecord & { readonly state: 'created' };

export const isCreated = (record: WorkUnitRecord): record is CreatedRecord =>
  record.state === 'created';

export const startShaping = (
  record: CreatedRecord,
  sessionFile: string,
  now: string,
): WorkUnitRecord => ({
  ...record,
  state: 'shaping',
  phase: 'explore',
  sessionFiles: [...record.sessionFiles, sessionFile],
  updatedAt: now,
});

export const sessionFileName = (nowIso: string, uuid: string): string =>
  `${nowIso.replace(/[:.]/g, '-')}_${uuid}.jsonl`;

const workUnitSchema = z.object({
  slug: z.string().transform((slug) => slug as Slug),
  branch: z.string(),
  state: z.enum(['created', 'shaping']),
  phase: z.enum(['none', 'explore']),
  retryCount: z.literal(0),
  artifacts: z.strictObject({}),
  briefs: z.strictObject({}),
  sessionFiles: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}) satisfies z.ZodType<WorkUnitRecord>;

export const parseWorkUnit: (input: unknown) => Result<WorkUnitRecord, ParseError> =
  parserFor(workUnitSchema);
