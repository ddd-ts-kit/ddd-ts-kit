import { CliError } from '../cli-error';
import type { Name } from './name';

/** The words the language keeps for itself: none of them names a variable, which the generated code names after a concept. */
const RESERVED_WORDS: ReadonlySet<string> = new Set(
  [
    'arguments await break case catch class const continue debugger default delete do else enum eval export extends',
    'false finally for function if implements import in instanceof interface let new null package private protected',
    'public return static super switch this throw true try typeof undefined var void while with yield',
  ].flatMap((line) => line.split(' ')),
);

/** The globals and the utility types the generated code uses beside a concept: a class of that name hides them in its file. */
const GLOBALS: ReadonlySet<string> = new Set(
  [
    'Array Boolean Buffer Date Error Function Map Number Object Omit Partial Pick Promise Readonly Record RegExp Set',
    'String Symbol',
  ].flatMap((line) => line.split(' ')),
);

/**
 * Refuses a name no generated file can bear, with the reason: a reserved word of the language
 * once in camelCase (`const return = Return.create(...)`), or a global the templates use once in
 * PascalCase (`class Date` beside `now: Date`). No flag lets one through: the code would not compile.
 */
export function refuseUnwritable(name: Name, what: string, typed: string): void {
  const reason = reasonAgainst(name, what);

  if (reason !== undefined) {
    throw new CliError(
      `"${typed}" is not a valid ${what} name: ${reason}.`,
      `Name the ${what} in two words, as the business tells it from its neighbours: ReturnOrder, SupportCase, DueDate.`,
    );
  }
}

function reasonAgainst(name: Name, what: string): string | undefined {
  if (RESERVED_WORDS.has(name.camel)) {
    return `\`${name.camel}\` is a reserved word of the language, and the generated code names a variable after the ${what}`;
  }

  return GLOBALS.has(name.pascal)
    ? `the generated code uses \`${name.pascal}\` of the language, which a class of that name would hide`
    : undefined;
}
