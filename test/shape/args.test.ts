import { expect, test } from 'bun:test';
import { err, ok } from 'true-myth/result';
import { parseShapeArgs } from '../../src/shape/args';

test('--branch <b> adopts that branch', () => {
  expect(parseShapeArgs('--branch feat/x')).toEqual(ok({ kind: 'Adopt', branch: 'feat/x' }));
});

test.each(['', '--branch', '--branch a b', '--branch -x', 'feat/x', '--other x'])(
  '%p is a usage error',
  (args) => {
    expect(parseShapeArgs(args)).toEqual(err({ kind: 'Usage', input: args }));
  },
);
