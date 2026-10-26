import { expect, test } from 'bun:test';
import * as z from 'zod';
import { parserFor } from '../src/parse';

const parse = parserFor(z.object({ n: z.number() }));

test('parserFor gives the parsed value on success', () => {
  expect(parse({ n: 1 }).isOk).toBe(true);
  expect(parse({ n: 1 }).unwrapOr({ n: 0 })).toEqual({ n: 1 });
});

test('parserFor gives a ParseError carrying the issues on failure', () => {
  const error = parse({ n: 'x' }).match({ Ok: () => undefined, Err: (e) => e });
  expect(error?.kind).toBe('ParseError');
  expect(error?.issues[0]?.path).toEqual(['n']);
});
