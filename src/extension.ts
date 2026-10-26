import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { shape } from './shape/command';

export default (pi: Pick<ExtensionAPI, 'registerCommand'>): void => {
  pi.registerCommand('shape', {
    description: 'Start or resume the work unit on a git branch',
    handler: shape,
  });
};
