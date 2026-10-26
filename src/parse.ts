import { err, ok, type Result } from 'true-myth/result';
import type * as z from 'zod';

export type ParseError = {
  readonly kind: 'ParseError';
  readonly message: string;
  readonly issues: readonly z.core.$ZodIssue[];
};

export const parserFor =
  <S extends z.ZodType>(schema: S) =>
  (input: unknown): Result<z.infer<S>, ParseError> => {
    const result = schema.safeParse(input);
    return result.success
      ? ok(result.data)
      : err({ kind: 'ParseError', message: result.error.message, issues: result.error.issues });
  };
