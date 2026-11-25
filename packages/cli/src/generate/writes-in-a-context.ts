import type { Kind } from './kind';

/** True when the first argument of a kind names the context it writes in, or the shared kernel. */
export function writesInAContext({ scope }: Kind): boolean {
  return scope === 'context' || scope === 'context-or-shared-kernel';
}
