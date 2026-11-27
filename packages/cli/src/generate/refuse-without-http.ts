import { CliError } from '../cli-error';
import type { Config } from '../config';

/** What a kind that writes for the HTTP stack is refused on, in a project that has none. */
export const NO_HTTP_STACK = 'This project has no HTTP stack (stack.http is "none").';

/** Said by a kind that writes for the HTTP stack (a route, a guard): what to do in a project without one. */
export interface NeedsHttp {
  readonly fix: string;
}

/** Refuses a kind that needs the HTTP stack, in a project without one, before it names anything. */
export function refuseWithoutHttp(config: Config, needs: NeedsHttp | undefined): void {
  if (needs !== undefined && config.stack.http === 'none') {
    throw new CliError(NO_HTTP_STACK, needs.fix);
  }
}
