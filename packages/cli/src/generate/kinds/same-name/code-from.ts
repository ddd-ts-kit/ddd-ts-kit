import { scan } from '../../../check/scan/scan';
import { LINKED } from './linked';
import type { Sources } from './sources-of';

/** A module a file exports names from: what it only imports, it exports under a name written in the file itself. */
const FROM = /\bexport\b[^;'"]*\bfrom\s*['"]([^'"]+)['"]/g;

/** How many files are read from one that is not read with certainty. */
const BOUND = 16;

/**
 * The code of a file and of every file of the project it takes names from, each once, comments
 * and strings blanked: where a name it may export is written as a word. A symbolic link is not
 * read, but the text it points at in the project holds the words it may export.
 */
export function codeFrom(sources: Sources, start: string): string[] {
  const code: string[] = [];
  const seen = new Set<string>();
  const next = [start];

  while (next.length > 0 && seen.size < BOUND) {
    const file = next.shift() ?? '';
    const text = seen.has(file) ? undefined : wordsOf(sources.read(file));

    seen.add(file);

    if (text !== undefined) {
      code.push(scan(text).code);

      for (const [, source = ''] of text.matchAll(FROM)) {
        const resolved = sources.resolve(file, source);

        next.push(...(resolved.kind === 'file' ? [resolved.path] : []));
      }
    }
  }

  return code;
}

/** The text a file holds its words in: a link is not read, but the text it points at in the project holds the words it may export. */
function wordsOf(text: string | undefined): string | undefined {
  return text?.startsWith(LINKED) === true ? text.slice(LINKED.length) : text;
}
