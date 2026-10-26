import { err, ok, type Result } from 'true-myth/result';
import type { ShapeError } from './outcome';

export type ShapeRequest =
  | { readonly kind: 'Report' }
  | { readonly kind: 'Adopt'; readonly branch: string };

export const parseShapeArgs = (args: string): Result<ShapeRequest, ShapeError> => {
  if (args.trim() === '') return ok({ kind: 'Report' });
  const [flag, branch, ...rest] = args.trim().split(/\s+/);
  return flag === '--branch' && branch !== undefined && !branch.startsWith('-') && rest.length === 0
    ? ok({ kind: 'Adopt', branch })
    : err({ kind: 'Usage', input: args });
};
