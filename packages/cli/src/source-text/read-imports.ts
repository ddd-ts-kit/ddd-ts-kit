import type { Scan } from '../check/scan/scan';
import { closingBracket } from '../check/text/closing-bracket';
import type { ImportStatement } from './import-statement';

const KEYWORD = /(?<![\w$.])import(?![\w$])/g;

/** What stands between the keyword and the specifier: nothing (a side effect), or bindings and `from`. */
const CLAUSE =
  /^(?:\s*|(\s+type(?=[\s{*]))?\s*(?:([\w$]+)\s*,?)?\s*(?:(\*\s*as\s+[\w$]+)\s*)?(?:\{([^{}]*)\})?\s*from\s*)$/;

const ATTRIBUTES = /^\s*with\s*\{/;

/**
 * The import statements of a source, read in its code: a keyword, bindings, and the string that
 * names the module, on one line or several, with any quote and with or without `;`. A dynamic
 * import, an import type, and what a comment, a string or a template holds are not statements.
 */
export function readImports(text: string, { code, strings }: Pick<Scan, 'code' | 'strings'>): ImportStatement[] {
  return [...code.matchAll(KEYWORD)].flatMap(({ index: start }) => {
    const literal = strings.find((candidate) => candidate.start > start);
    const clause = literal === undefined ? null : CLAUSE.exec(code.slice(start + 'import'.length, literal.start));

    if (literal === undefined || clause === null) {
      return [];
    }

    const [, type, byDefault, namespace, braces = ''] = clause;
    const end = endOf(code, literal.end);

    return [
      {
        start,
        end,
        specifier: literal.value,
        typeOnly: type !== undefined,
        whole: [byDefault, namespace?.replace(/\s+/g, ' ')].flatMap((binding) => binding ?? []),
        named: braces
          .split(',')
          .map((binding) => binding.trim().replace(/\s+/g, ' '))
          .filter((binding) => binding !== ''),
        quote: text.charAt(literal.start),
        endsWithSemicolon: code.charAt(end - 1) === ';',
        holdsComment: code.slice(start, literal.start) !== text.slice(start, literal.start),
      },
    ];
  });
}

/** Where a statement ends after its specifier: after its import attributes when it has some, and after its `;`. */
function endOf(code: string, afterSpecifier: number): number {
  const attributes = ATTRIBUTES.exec(code.slice(afterSpecifier));
  const closed = attributes === null ? undefined : closingBracket(code, afterSpecifier + attributes[0].length - 1);
  const end = closed === undefined ? afterSpecifier : closed + 1;
  const semicolon = /^[ \t]*;/.exec(code.slice(end));

  return semicolon === null ? end : end + semicolon[0].length;
}
