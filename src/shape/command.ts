import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { render } from './outcome';

export type ShapeContext = {
  readonly ui: Pick<ExtensionCommandContext['ui'], 'notify'>;
};

export const shape = async (args: string, ctx: ShapeContext): Promise<void> => {
  const { message, level } = render({ kind: 'Usage', input: args });
  ctx.ui.notify(message, level);
};
