export type ShapeError =
  | { readonly kind: 'Usage'; readonly input: string }
  | { readonly kind: 'InvalidSlug'; readonly branch: string }
  | { readonly kind: 'NotARepository'; readonly cwd: string }
  | { readonly kind: 'CheckoutFailed'; readonly branch: string; readonly stderr: string }
  | { readonly kind: 'AlreadyExists'; readonly slug: string }
  | { readonly kind: 'WriteFailed'; readonly path: string; readonly code: string };

export type Unexpected = {
  readonly kind: 'Unexpected';
  readonly operation: string;
  readonly cause: unknown;
};

export type ShapeFailure = ShapeError | Unexpected;

export type Outcome =
  | { readonly kind: 'Created'; readonly slug: string; readonly branch: string }
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
    default: {
      const unhandled: never = outcome;
      return unhandled;
    }
  }
};
