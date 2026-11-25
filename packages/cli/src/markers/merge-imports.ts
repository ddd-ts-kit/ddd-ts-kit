import { LINE_WIDTH } from '../layout';
import { boundBy, type ImportStatement, ImportStatements } from '../source-text';

/** What an imports region holds, in order: a statement of named imports the merge may rewrite, or a line it keeps as written. */
type Piece = ImportStatement | string;

/**
 * Adds import lines to those already there; names imported from one module end up in one
 * statement, written one name per line once it no longer fits the line width. Only a statement
 * of named imports that stands alone on its lines is written again, in its own style: one that
 * holds a comment, shares its line or binds a default or a namespace is kept as it is written.
 */
export function mergeImports(present: readonly string[], wanted: readonly string[]): string[] {
  const held = ImportStatements.of(present.join('\n')).all;

  const pieces = wanted
    .map((line) => line.trim())
    .reduce((merged, line) => withLine(merged, held, line), piecesOf(present, held));

  return pieces.flatMap((piece) => (typeof piece === 'string' ? [piece] : fitted(piece)));
}

/** The lines of the region, each statement the merge may rewrite standing for the lines it takes. */
function piecesOf(present: readonly string[], held: readonly ImportStatement[]): Piece[] {
  const text = present.join('\n');
  const pieces: Piece[] = [];
  let start = 0;
  let rewritten = 0;

  for (const line of present) {
    const statement = held.find((candidate) => candidate.start >= start && candidate.start <= start + line.length);
    const isRewritable = statement !== undefined && isNamedOnly(statement) && standsAlone(text, statement, start);

    if (start >= rewritten) {
      pieces.push(isRewritable ? statement : line);
      rewritten = isRewritable ? statement.end : rewritten;
    }

    start += line.length + 1;
  }

  return pieces;
}

const isNamedOnly = ({ whole, named, holdsComment }: ImportStatement): boolean =>
  whole.length === 0 && named.length > 0 && !holdsComment;

/** Whether the lines of a statement hold it and nothing else: no comment after it, no other statement. */
function standsAlone(text: string, { start, end }: ImportStatement, lineStart: number): boolean {
  return text.slice(lineStart, endOfLine(text, end)).trim() === text.slice(start, end);
}

const endOfLine = (text: string, offset: number): number =>
  text.indexOf('\n', offset) === -1 ? text.length : text.indexOf('\n', offset);

function withLine(pieces: readonly Piece[], held: readonly ImportStatement[], line: string): Piece[] {
  if (pieces.includes(line)) {
    return [...pieces];
  }

  const wanted = ImportStatements.of(line).all[0];

  if (wanted === undefined) {
    return [...pieces, line];
  }

  const twin = isNamedOnly(wanted)
    ? pieces.findIndex((piece) => typeof piece !== 'string' && sameSource(piece, wanted))
    : -1;

  if (twin !== -1) {
    return pieces.map((piece, index) =>
      index === twin && typeof piece !== 'string' ? withNames(piece, wanted.named) : piece,
    );
  }

  return held.some((statement) => brings(statement, wanted))
    ? [...pieces]
    : [...pieces, isNamedOnly(wanted) ? wanted : line];
}

const sameSource = (left: ImportStatement, right: ImportStatement): boolean =>
  left.typeOnly === right.typeOnly && left.specifier === right.specifier;

const withNames = (statement: ImportStatement, names: readonly string[]): ImportStatement => ({
  ...statement,
  named: [...new Set([...statement.named, ...names])],
});

/** Whether a statement kept as written already imports what another asks of the same module. */
function brings(statement: ImportStatement, wanted: ImportStatement): boolean {
  const bound = boundBy(statement);

  return sameSource(statement, wanted) && boundBy(wanted).every((name) => bound.includes(name));
}

function fitted(statement: ImportStatement): string[] {
  const { named, typeOnly, quote, specifier, endsWithSemicolon } = statement;
  const opening = `import ${typeOnly ? 'type ' : ''}{`;
  const closing = `} from ${quote}${specifier}${quote}${endsWithSemicolon ? ';' : ''}`;
  const line = `${opening} ${named.join(', ')} ${closing}`;

  // One name alone stays on its line, whatever its length.
  return line.length <= LINE_WIDTH || named.length === 1
    ? [line]
    : [opening, ...named.map((name) => `  ${name},`), closing];
}
