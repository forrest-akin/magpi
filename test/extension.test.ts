import { expect, test } from 'bun:test';
import extension from '../src/extension';

test('registers the shape command with a description', () => {
  const registered: { name: string; description?: string }[] = [];
  extension({
    registerCommand: (name, options) => {
      registered.push({ name, description: options.description });
    },
  });
  expect(registered).toHaveLength(1);
  expect(registered[0]?.name).toBe('shape');
  expect(registered[0]?.description).toBeString();
});
