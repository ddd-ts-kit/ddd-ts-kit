import type { Scan } from '../scan/scan';
import { splitTopLevel } from '../text/split-top-level';
import type { TakenKey } from './taken-key';
import { holderOf } from './text/holder-of';
import { significantBefore } from './text/significant-before';
import { wordBefore } from './text/word-before';

const DECLARES_VARIABLES = new Set(['const', 'let', 'var']);
const KEY = /^[\w$]+/;

/**
 * The keys a declaration takes by name out of the value that starts at this offset: `env` of
 * `const { env } = process`, `log` of `const { log: write } = console`. A computed key and the
 * rest of the object name nothing.
 */
export function keysTakenFrom(scan: Scan, value: number): TakenKey[] {
  const { code } = scan;
  const assignment = significantBefore(code, value);
  const close = significantBefore(code, assignment);
  const pattern = code.charAt(assignment) === '=' && code.charAt(close) === '}' ? holderOf(code, close) : undefined;

  if (pattern === undefined || !DECLARES_VARIABLES.has(wordBefore(code, pattern.start))) {
    return [];
  }

  return splitTopLevel(code.slice(pattern.start + 1, close)).flatMap((part) => {
    const at = pattern.start + 1 + part.start;
    const name = KEY.exec(part.code)?.[0] ?? scan.strings.find(({ start }) => start === at)?.value;

    return name === undefined ? [] : [{ name, at }];
  });
}
