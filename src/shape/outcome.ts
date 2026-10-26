export type Outcome = { readonly kind: 'Usage'; readonly input: string };

export type Notice = {
  readonly message: string;
  readonly level: 'info' | 'warning' | 'error';
};

export const render = (outcome: Outcome): Notice => {
  switch (outcome.kind) {
    case 'Usage':
      return { message: 'Usage: /shape --branch <branch>', level: 'error' };
    default: {
      const unhandled: never = outcome.kind;
      return unhandled;
    }
  }
};
