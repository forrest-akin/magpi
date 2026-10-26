import { expect, test } from 'bun:test';
import { shape } from '../../src/shape/command';

const fakeCtx = () => {
  const notices: { message: string; level?: string }[] = [];
  const ctx = {
    ui: {
      notify: (message: string, level?: 'info' | 'warning' | 'error') => {
        notices.push({ message, level });
      },
    },
  };
  return { ctx, notices };
};

test.each(['', '--branch feat/x', 'anything else'])(
  'args %p notify the usage at error',
  async (args) => {
    const { ctx, notices } = fakeCtx();
    await shape(args, ctx);
    expect(notices).toEqual([{ message: 'Usage: /shape --branch <branch>', level: 'error' }]);
  },
);
