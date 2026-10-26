import { err, ok, type Result } from 'true-myth/result';
import type { ShapeError } from '../shape/outcome';

export type Slug = string & { readonly __brand: 'Slug' };

export const slugFromBranch = (branch: string): Result<Slug, ShapeError> => {
  const slug = branch
    .toLowerCase()
    .replace(/[ _/]/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40);
  return slug === '' ? err({ kind: 'InvalidSlug', branch }) : ok(slug as Slug);
};
