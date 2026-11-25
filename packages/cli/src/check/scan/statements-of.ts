import { clauseNames } from './clause-names';
import type { FoundStatement } from './found-statement';
import type { StringRecord } from './string-record';

const KEYWORD = /(?<![\w$.])(import|export|require)\b/g;
const NOTHING = /\s*/y;
const CALL = /\s*\(\s*/y;
const FROM = /\s*\bfrom\s*/y;
/** One piece of a clause: a named list, a name, a comma or a star. Another statement opens at `import` or `export`. */
const BINDING = /\s*(?:\{[^{}]*\}|(?!(?:import|export)\b)[\w$]+|[,*])/y;
const TYPE_ONLY = /^\s*type\b/;

type LiteralAfter = (pattern: RegExp, offset: number) => StringRecord | undefined;

/**
 * The import and export statements of a blanked source, each with the string literal that is its
 * module specifier. A statement is read forward from its keyword: comments are white space there,
 * so neither a comment, an indentation nor the length of a list keeps a specifier from its keyword.
 */
export function statementsOf(code: string, strings: readonly StringRecord[]): FoundStatement[] {
  const starts = new Map(strings.map((literal) => [literal.start, literal]));

  const literalAfter: LiteralAfter = (pattern, offset) => {
    pattern.lastIndex = offset;

    return pattern.test(code) ? starts.get(pattern.lastIndex) : undefined;
  };

  return [...code.matchAll(KEYWORD)].flatMap((keyword) => {
    const after = keyword.index + keyword[0].length;
    const found = READERS[keyword[1] ?? '']?.(code, after, literalAfter);

    return found === undefined ? [] : [{ ...found, offset: keyword.index }];
  });
}

type Reader = (code: string, after: number, literalAfter: LiteralAfter) => Omit<FoundStatement, 'offset'> | undefined;

const READERS: Readonly<Record<string, Reader>> = {
  require: (_, after, literalAfter) => unbound('require', literalAfter(CALL, after)),
  export: (code, after, literalAfter) => {
    const clause = clauseFrom(code, after, literalAfter);

    return clause && { record: { kind: 'export', typeOnly: clause.typeOnly, names: [], typeNames: [] }, ...clause };
  },
  import: (code, after, literalAfter) =>
    unbound('side-effect', literalAfter(NOTHING, after)) ??
    unbound('dynamic', literalAfter(CALL, after)) ??
    bound(clauseFrom(code, after, literalAfter)),
};

function unbound(kind: 'side-effect' | 'dynamic' | 'require', literal: StringRecord | undefined) {
  return literal && { record: { kind, typeOnly: false, names: [], typeNames: [] }, literal };
}

function bound(clause: Clause | undefined) {
  if (clause === undefined) {
    return undefined;
  }

  const { names, typeNames } = clauseNames(clause.text.replace(TYPE_ONLY, ''));
  const { typeOnly, literal } = clause;

  return { record: { kind: 'import' as const, typeOnly, names, typeNames: typeOnly ? names : typeNames }, literal };
}

interface Clause {
  /** What stands between the keyword and `from`. */
  readonly text: string;
  readonly typeOnly: boolean;
  readonly literal: StringRecord;
}

/** The clause that opens at this offset and reaches `from` and a specifier through bindings only; nothing for any other statement. */
function clauseFrom(code: string, start: number, literalAfter: LiteralAfter): Clause | undefined {
  for (let end = start; ; end = BINDING.lastIndex) {
    const literal = literalAfter(FROM, end);

    if (literal !== undefined) {
      const text = code.slice(start, end);

      return { text, typeOnly: TYPE_ONLY.test(text), literal };
    }

    BINDING.lastIndex = end;

    if (!BINDING.test(code)) {
      return undefined;
    }
  }
}
