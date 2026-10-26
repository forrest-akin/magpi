import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

export const tempDir = async (): Promise<string> =>
  realpath(await mkdtemp(join(tmpdir(), 'magpi-')));

export const tempRepo = async (...branches: string[]): Promise<string> => {
  const root = await tempDir();
  git(root, 'init', '--quiet', '--initial-branch=main');
  git(
    root,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '--quiet',
    '--allow-empty',
    '-m',
    'init',
  );
  for (const branch of branches) git(root, 'branch', branch);
  return root;
};
