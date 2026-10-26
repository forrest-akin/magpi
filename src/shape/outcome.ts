import type { WorkUnitRecord } from '../workunit/record';

export type ShapeError =
  | { readonly kind: 'Usage'; readonly input: string }
  | { readonly kind: 'InvalidSlug'; readonly branch: string }
  | { readonly kind: 'NotARepository'; readonly cwd: string }
  | { readonly kind: 'CheckoutFailed'; readonly branch: string; readonly stderr: string }
  | { readonly kind: 'AlreadyExists'; readonly slug: string }
  | { readonly kind: 'WriteFailed'; readonly path: string; readonly code: string }
  | { readonly kind: 'Corrupt'; readonly path: string; readonly detail: string }
  | { readonly kind: 'SlugTaken'; readonly slug: string; readonly branch: string }
  | { readonly kind: 'Orphaned'; readonly path: string }
  | { readonly kind: 'SwitchCancelled'; readonly slug: string };

export type Unexpected = {
  readonly kind: 'Unexpected';
  readonly operation: string;
  readonly cause: unknown;
};

export type ShapeFailure = ShapeError | Unexpected;

export type Outcome =
  | { readonly kind: 'Created'; readonly slug: string; readonly branch: string }
  | {
      readonly kind: 'Status';
      readonly slug: string;
      readonly state: WorkUnitRecord['state'];
      readonly phase: WorkUnitRecord['phase'];
    }
  | {
      readonly kind: 'Resumed';
      readonly slug: string;
      readonly state: WorkUnitRecord['state'];
      readonly phase: WorkUnitRecord['phase'];
    }
  | ShapeError;

export type Notice = {
  readonly message: string;
  readonly level: 'info' | 'warning' | 'error';
};

export const render = (outcome: Outcome): Notice => {
  switch (outcome.kind) {
    case 'Usage':
      return { message: 'Usage: /shape --branch <branch>', level: 'error' };
    case 'Created':
      return {
        message: `Work unit ${outcome.slug} created on branch ${outcome.branch}.`,
        level: 'info',
      };
    case 'Status':
      return {
        message: `Work unit ${outcome.slug}: ${outcome.state} (${outcome.phase}).`,
        level: 'info',
      };
    case 'Resumed':
      return {
        message: `Resumed work unit ${outcome.slug} (${outcome.state}, ${outcome.phase}).`,
        level: 'info',
      };
    case 'InvalidSlug':
      return { message: `Branch ${outcome.branch} gives an empty slug.`, level: 'error' };
    case 'NotARepository':
      return { message: `Not in a git repository: ${outcome.cwd}`, level: 'error' };
    case 'CheckoutFailed':
      return { message: outcome.stderr.replace(/\n$/, ''), level: 'error' };
    case 'AlreadyExists':
      return { message: `Work unit ${outcome.slug} already exists.`, level: 'warning' };
    case 'WriteFailed':
      return { message: `Could not write ${outcome.path}: ${outcome.code}`, level: 'error' };
    case 'Corrupt':
      return { message: `${outcome.path} is corrupt: ${outcome.detail}`, level: 'error' };
    case 'SlugTaken':
      return {
        message: `Work unit ${outcome.slug} belongs to branch ${outcome.branch}; rename this branch to adopt it.`,
        level: 'error',
      };
    case 'Orphaned':
      return {
        message: `Work unit folder ${outcome.path} has no work.json; restore it or remove the folder.`,
        level: 'error',
      };
    case 'SwitchCancelled':
      return {
        message: `Switch to work unit ${outcome.slug}'s session cancelled.`,
        level: 'warning',
      };
    default: {
      const unhandled: never = outcome;
      return unhandled;
    }
  }
};
