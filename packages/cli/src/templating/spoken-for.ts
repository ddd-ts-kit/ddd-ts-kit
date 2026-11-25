import { CliError } from '../cli-error';
import { isOneOf, PACKAGE_MANAGERS } from '../config';
import { inDialect } from '../package-manager/in-dialect';
import type { RenderContext } from './render-context';

/** A template as it is written, for npm, and where it is read: what names it when it cannot be rendered. */
interface Written {
  readonly template: string;
  readonly origin: string;
}

/**
 * A text rendered from a template, as the package manager of its variables says it (`pm.name`,
 * among the variables of the stack): the templates are written for npm, and what the kit renders
 * is the one text it translates. A template that names a command of npm and is given no package
 * manager is refused, so that no generator writes `npm run` in a project that installs otherwise.
 */
export function spokenFor(context: RenderContext, rendered: string, { template, origin }: Written): string {
  const pm = context['pm'];
  const manager = typeof pm === 'object' ? pm['name'] : undefined;

  if (isOneOf(PACKAGE_MANAGERS, manager)) {
    return inDialect(rendered, manager);
  }

  if (PACKAGE_MANAGERS.some((other) => inDialect(template, other) !== template)) {
    throw new CliError(
      `${origin}: the template names a command of npm, and its variables name no package manager ("pm").`,
      'Pass the variables of the stack to the renderer (`stackVars`), which hold it.',
    );
  }

  return rendered;
}
