import { declaredVocabularies } from '../language/declared-vocabularies';
import type { DeclaredValue } from '../language/declared-value';
import { inOutsideRecord } from '../language/in-outside-record';
import { otherLanguageOf } from '../language/other-language-of';
import { typedByOtherLanguage } from '../language/typed-by-other-language';
import type { Finding } from '../model/finding';
import type { Rule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import type { StringRecord } from '../scan/string-record';
import { inContext } from '../support/in-context';
import { perFile } from '../support/per-file';

const RELATIONSHIP_SCHEMA = /(?<![\w$.])defineSchema\s*\(/;
const MODULE_SPECIFIER = /\b(?:from|import)\s*$/;
/** `text('note')`, `createTable('invoice')`, `.where('note', ..)`: the first argument of a call, but `.default(..)`. */
const FIRST_ARGUMENT = /(?<![\w$])(?!default\s*\()[\w$]+\s*\(\s*$/;
/** `{ name: 'note' }`, `tableName: 'invoice'`: the name of a column, a table or a schema in an object. */
const NAME_PROPERTY = /(?<![\w$])(?:name|tableName|schema)\s*:\s*$/;

export const languageDeclaredVocabulary: Rule = {
  id: 'language/declared-vocabulary',
  description:
    'Under "stack.literals": "named", a value of a closed vocabulary the project declares (an object `as const` with the union type of its name, a permission set of definePermissions) is read through it, never written again as a string literal outside its declaration, a quoted key included: the vocabulary of a context in that context, the one of the platform in the platform and the route groups of the contexts, a permission id and one of the shared kernel everywhere; tests, published languages, the relationship schema and the storage names of the persistence (a column, a table, a schema) are not judged, nor, outside `domain/`, a word whose type says it belongs to another language (a key of an object typed `Record<T, ..>`, a value of one typed `Record<.., T>`, a literal written `satisfies T`, `T` one type of a published language, of a package or of `infrastructure/anti-corruption/` or `infrastructure/external/`) and the types of an outside record declared there; an object is read when each entry is a key and a string literal.',
  severity: 'error',
  doc: {
    why: 'A status, a kind, a role or a permission is a word of the language whose values are a closed list. Spelled again as a string wherever it is compared, granted or stored, each copy can drift: a typo compiles, a renamed value leaves its old spelling behind, and nothing completes it in the editor. Declared once, as an object `as const` and the union type of its name (a permission set for permissions), it is read by its key, completed by the editor, and a parameter typed with it accepts nothing else. The value stays the same string on the wire and in the database. A quoted key counts, and is written as a computed key, `[AppointmentStatus.NoShow]: ..`. Tests and published languages are not judged: a test sends the values a client sends, and a published language names the values of its contract itself; nor is the relationship schema of the access model, which declares its relations. In the persistence of a context, the name of a column, a table or a schema is a word of the storage that may spell a value by chance: the first argument of a call (`text("note")`) and the value of `name`, `tableName` or `schema` are not judged; a stored value, the argument of `.default(..)` or a value compared in a query, is. A word of another language that spells a value of the context does not belong to the context, and is not judged outside `domain/` when its type says so: a key of a table typed `Record<T, ..>`, a value of one typed `Record<.., T>` or a literal written `"x" satisfies T`, `T` being one type imported from a published language, imported as a type from a package, or imported from or declared in `infrastructure/anti-corruption/` or `infrastructure/external/`, so that the compiler holds its spelling. Where: the vocabulary of a context in that context only (the same word may mean something else next door), one of the platform (the roles) in the platform and in the route groups `*.routes.ts`, a permission id and a vocabulary of the shared kernel everywhere. What is read as a vocabulary: every entry a key and a string literal, comments, either quote and `as const satisfies ..` allowed; a number, a spread or a computed entry leaves the object unread, and so does a union type written otherwise than `(typeof X)[keyof typeof X]`. The rule holds under "stack.literals": "named", which `init` writes; a config that does not say keeps the free literals of 0.5.',
    bad: `// domain/vocabularies/appointment-status.vocabulary.ts declares AppointmentStatus
if (appointment.status === 'no-show') {
  grants.push('billing:invoice.issue');
}`,
    good: `if (appointment.status === AppointmentStatus.NoShow) {
  grants.push(billingPermissions['invoice.issue']);
}`,
  },
  scope: 'project',
  run(project) {
    if (project.config.stack.literals !== 'named') {
      return [];
    }

    const declared = declaredVocabularies(project.files);

    return perFile(project, this.id, (file) => (isJudged(file) ? rawValues(file, declared) : []));
  },
};

/**
 * A test spells the values it sends on purpose; a published language is a contract that names its
 * values itself, and so is the relationship schema of the access model, which declares its relations.
 */
function isJudged(file: SourceFile): boolean {
  const published = inContext(file.location) && file.location.layer === 'published-language';

  return !file.isTest && !published && !RELATIONSHIP_SCHEMA.test(file.scan.code);
}

function rawValues(file: SourceFile, declared: ReadonlyMap<string, readonly DeclaredValue[]>): Finding[] {
  const other = otherLanguageOf(file);

  return file.scan.strings.flatMap((literal) => {
    const values = (declared.get(literal.value) ?? []).filter((value) => isReadBy(file, value));

    if (
      values.length === 0 ||
      values.some(({ file: at }) => at === file.path) ||
      isSpecifier(file.scan.code, literal) ||
      isStorageName(file, literal) ||
      isOtherLanguage(file, literal, other)
    ) {
      return [];
    }

    return [
      {
        line: literal.line,
        message: `"${literal.value}" is a value of ${values.map(({ vocabulary, file: at }) => `${vocabulary} (${at})`).join(' and of ')}.`,
        fix: fixOf(literal.value, values, other),
      },
    ];
  });
}

/**
 * The fix names the vocabulary; when the file reads another language, it also says how a word of
 * that language is written so that the compiler holds it, instead of the vocabulary of the context.
 */
function fixOf(value: string, values: readonly DeclaredValue[], other: ReadonlyMap<string, string>): string {
  const written = values.map((declared) => declared.written).join(' or ');

  if (other.size === 0) {
    return `Write ${written}, as a computed key \`[..]:\` for a key: the value is declared once, the editor completes it and a typo stops the build.`;
  }

  const read = [...other].map(([name, place]) => `${name} of ${place}`).join(', ');
  const vocabulary = values[0]?.vocabulary ?? '';

  return `Write ${written}, as a computed key \`[..]:\` for a key, if it is the word of this context: the value is declared once, the editor completes it and a typo stops the build. If it is a word of another language this file reads (${read}), say so by its type and the compiler holds its spelling: type the table by it, \`Record<TheirType, ${vocabulary}>\` for its keys or \`Record<${vocabulary}, TheirType>\` for its values (an annotation or \`satisfies\`), or write \`'${value}' satisfies TheirType\` in a comparison or a \`case\`.`;
}

/**
 * A word of another language is not the context's when its type says so (a key or a value of a
 * table typed by it, `satisfies`), and neither is a type of an outside record as it arrives.
 */
function isOtherLanguage(file: SourceFile, literal: StringRecord, other: ReadonlyMap<string, string>): boolean {
  return typedByOtherLanguage(file.scan.code, literal, other) || inOutsideRecord(file, literal);
}

/** A vocabulary of a context is the language of that context alone; the one of the platform is read there and by the route groups, where a guard names a role. */
function isReadBy(file: SourceFile, { readBy }: DeclaredValue): boolean {
  const { location } = file;

  if (readBy === 'everywhere') {
    return true;
  }

  if (readBy === 'platform') {
    return location.area !== 'context' || file.path.endsWith('.routes.ts');
  }

  return location.area === 'context' && location.context === readBy.context;
}

/** The specifier of an import or an export names a module, not a value. */
function isSpecifier(code: string, literal: StringRecord): boolean {
  return MODULE_SPECIFIER.test(before(code, literal));
}

/**
 * In the persistence of a context, the name of a column, a table or a schema is a word of the
 * storage that may spell a value by chance (a column `note` next to a kind `note`): the
 * first argument of a call, or the value of `name`, `tableName` or `schema`. A stored value, the
 * argument of `.default(..)` or a value compared in a query, is still judged.
 */
function isStorageName(file: SourceFile, literal: StringRecord): boolean {
  const { location } = file;

  const persistence =
    location.area === 'context' && location.layer === 'infrastructure' && location.inside[0] === 'persistence';

  const preceding = before(file.scan.code, literal);

  return persistence && (FIRST_ARGUMENT.test(preceding) || NAME_PROPERTY.test(preceding));
}

function before(code: string, literal: StringRecord): string {
  return code.slice(Math.max(0, literal.start - 40), literal.start);
}
