import type { Scan } from '../scan/scan';
import { significantAfter } from './text/significant-after';

const DOTTED = /^\s*\??\.\s*([\w$]+)/;
const QUOTED = /^\s*(?:\?\.\s*)?\[\s*(?=['"])/;

/** The member read right after this offset: `now` of `.now`, of `?.now` and of `['now']`. */
export function memberAfter(scan: Scan, at: number): string | undefined {
  const rest = scan.code.slice(at);
  const quoted = QUOTED.exec(rest);

  if (quoted === null) {
    return DOTTED.exec(rest)?.[1];
  }

  const key = scan.strings.find(({ start }) => start === at + quoted[0].length);

  return key !== undefined && scan.code.charAt(significantAfter(scan.code, key.end)) === ']' ? key.value : undefined;
}
