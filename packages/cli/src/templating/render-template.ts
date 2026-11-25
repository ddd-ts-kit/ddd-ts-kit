import { fitSource } from '../layout';
import { readTemplate } from './read-template';
import { render } from './render';
import type { RenderContext } from './render-context';
import { spokenFor } from './spoken-for';

/**
 * Renders a template of the package, in the dialect of the package manager its variables name.
 * Dropped conditional blocks may leave runs of blank lines behind: one is kept, and one final newline.
 */
export function renderTemplate(name: string, context: RenderContext): string {
  const origin = `templates/${name}`;
  const template = readTemplate(name);

  const rendered = render(template, context, origin)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '\n');

  // The names of the project decide which lines of a source file fit: they are laid out once known.
  return spokenFor(context, name.endsWith('.ts.tpl') ? fitSource(rendered) : rendered, { template, origin });
}
