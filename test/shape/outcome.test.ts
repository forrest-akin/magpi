import { expect, test } from 'bun:test';
import { type Notice, type Outcome, render } from '../../src/shape/outcome';

test.each<[Outcome, string, Notice['level']]>([
  [{ kind: 'Usage', input: '' }, 'Usage: /shape --branch <branch>', 'error'],
  [
    { kind: 'Created', slug: 'feat-x', branch: 'feat/x' },
    'Work unit feat-x created on branch feat/x.',
    'info',
  ],
  [{ kind: 'InvalidSlug', branch: '!!' }, 'Branch !! gives an empty slug.', 'error'],
  [{ kind: 'NotARepository', cwd: '/tmp/a' }, 'Not in a git repository: /tmp/a', 'error'],
  [{ kind: 'CheckoutFailed', branch: 'b', stderr: 'error: nope\n' }, 'error: nope', 'error'],
  [{ kind: 'AlreadyExists', slug: 'feat-x' }, 'Work unit feat-x already exists.', 'warning'],
  [
    { kind: 'WriteFailed', path: '/r/work.json', code: 'EACCES' },
    'Could not write /r/work.json: EACCES',
    'error',
  ],
])('%o renders %p at %p', (outcome, message, level) => {
  expect(render(outcome)).toEqual({ message, level });
});
