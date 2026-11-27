import type { OptionSpecs } from '../commands/arguments';
import { toName } from '../naming';
import type { KindFlags, ReadRequest } from './read-request';
import type { Scope } from './scope';

/** The first argument of a kind that writes in the shared kernel instead of a context. */
export const SHARED_KERNEL = 'shared-kernel';

/**
 * The shared kernel opened as the scope of a kind: its directory is `sharedKernelDir`, its
 * glossary `<sharedKernelDir>/CONTEXT.md`, and its name the one its code list is named after
 * (`shared-kernel.codes.ts`, `SharedKernelCodes`).
 */
export function sharedKernelScope<O extends OptionSpecs>(request: ReadRequest<O>): Scope<KindFlags<O>> {
  const { ws, config, flags, module, probe } = request;

  return { ws, config, flags, module, probe, context: toName(SHARED_KERNEL), dir: config.sharedKernelDir };
}
