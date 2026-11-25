import type { SourceFile } from '../model/source-file';

const SAVE = /(?<![\w$.])saveAggregate\s*\(/g;

/** Where an adapter of tenant data saves an aggregate with `saveAggregate`, which names no tenant: the offset of each call. */
export function savesWithoutTenant(file: SourceFile): readonly number[] {
  return [...file.scan.code.matchAll(SAVE)].map((match) => match.index);
}
