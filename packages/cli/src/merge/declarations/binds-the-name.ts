import { enclosingGroup } from './enclosing-group';

/** A place of some code: where a name, or a bracket group, starts and ends. */
interface Span {
  readonly from: number;
  readonly to: number;
}

/** What opens a group of parentheses that holds a condition, not parameters. */
const CONTROL = /\b(?:if|while|for|switch|with)\s*$/;

/**
 * Whether some code binds a name itself: a local `const`, `let`, `var`, `function` or `class` of
 * that name, an arrow `name =>`, a parameter with or without a type or a default, a destructured
 * binding, a catch clause, an import alias, a label. No scope is read: code that binds a name is not taken
 * to read the outer declaration of that name anywhere. In doubt the code binds it.
 */
export function bindsTheName(code: string, name: string): boolean {
  const word = name.replaceAll('$', '\\$');

  const declared = new RegExp(
    `\\b(?:const|let|var|function\\s*\\*?|class)\\s+${word}(?![\\w$])|(?<![\\w$.])${word}\\s*=>|\\b(?:import|export)\\b[^;]*\\bas\\s+${word}(?![\\w$])|(?:^|[\\n{;])\\s*${word}\\s*:\\s*(?:for|while|do|switch|\\{)`,
  );

  const places = [...code.matchAll(new RegExp(`(?<![\\w$])${word}(?![\\w$])`, 'g'))];

  return declared.test(code) || places.some(({ index }) => bound(code, { from: index, to: index + name.length }));
}

/** Whether a place is an element of a list of parameters or of a destructuring pattern. */
function bound(code: string, span: Span): boolean {
  const group = enclosingGroup(code, span.from);

  if (group === undefined || !isElement(code, span, code.charAt(group.open))) {
    return false;
  }

  const after = code.slice(group.close + 1).trimStart();

  if (code.charAt(group.open) === '(') {
    return /^(?:=>|\{|:)/.test(after) && !CONTROL.test(code.slice(0, group.open));
  }

  return /^=(?![=>])/.test(after) || bound(code, { from: group.open, to: group.close + 1 });
}

/** Whether a place stands alone between the separators of a list: a name with its type or its default, not a part of an expression. */
function isElement(code: string, { from, to }: Span, opener: string): boolean {
  const before =
    code
      .slice(0, from)
      .trimEnd()
      .replace(/\.\.\.$/, '')
      .trimEnd()
      .at(-1) ?? '';

  const after = code.slice(to).trimStart();
  const starts = '(,{['.includes(before) || (before === ':' && opener === '{');

  return starts && before !== '' && /^(?:[,)}\]]|\??:|=(?![=>]))/.test(after);
}
