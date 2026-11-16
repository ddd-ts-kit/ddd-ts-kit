import { type ConflictClass, classifyConflict } from './classify-conflict';
import { mergeClientManifest } from './merge-client-manifest';
import { type ConflictBlock, conflictBlocks, type Segment } from './conflict-blocks';
import type { HeldRegion } from './declarations/merged-region';
import { settleDeclarations } from './declarations/settle-declarations';
import type { ConflictedPath } from './conflicted-path';
import type { MergeRepository } from './lost/merge-repository';
import { mergeSlicesRows } from './merge-slices-rows';
import { mergeStoredEventsLock } from './merge-stored-events-lock';
import { registryUnion } from './registry-union';
import type { Resolution } from './resolution';
import { settleRegions } from './settle-regions';

const DERIVED = 'derived: trunk side, regenerated at the end';

/** The classes whose trunk side is taken whole: a tool writes them again after the merge. */
const TRUNK_SIDE: Readonly<Partial<Record<ConflictClass, string>>> = {
  derived: DERIVED,
  'drizzle-meta': 'drizzle-kit journal and snapshots: trunk side, the migrations of the branch generated again on top',
  lockfile: 'lockfile: trunk side',
};

/**
 * Settles a conflicted path by its class: the trunk's side of what a tool writes again, the
 * package.json of a client at the higher version of both sides, the slices rows and the
 * stored-events lock merged by their keys, and inside a source or a mixed document
 * each conflict lying in a generated region: the lines of both sides, or its declarations merged
 * one by one where those lines would leave a table, a model or a function open. What is left is a person's: a
 * source conflict, a declaration both sides wrote differently, a cell or a key both sides changed,
 * a file one side deleted, bytes that are not text.
 */
export function resolveConflict(path: ConflictedPath, repo: MergeRepository): Resolution {
  const kind = classifyConflict(path.file, repo);

  if (kind === 'client-manifest') {
    return clientManifest(path);
  }

  const trunkSide = TRUNK_SIDE[kind];

  if (trunkSide !== undefined) {
    return { file: path.file, kind, content: path.theirs ?? null, settled: true, how: trunkSide, blocks: [] };
  }

  const { ours, theirs } = path;

  if (path.binary || ours === undefined || theirs === undefined) {
    return leftOver(path, kind, oneSideMissing(path));
  }

  if (kind === 'slices' || kind === 'stored-events') {
    return byKeys({ ...path, ours, theirs }, kind);
  }

  return inRegions(path, kind, repo);
}

/** The trunk's package.json of a client at the higher version of both sides; the trunk's side when one has no text. */
function clientManifest(path: ConflictedPath): Resolution {
  const { file, ours, theirs } = path;
  const kind = 'client-manifest';

  if (path.binary || ours === undefined || theirs === undefined) {
    return { file, kind, content: theirs ?? null, settled: true, how: DERIVED, blocks: [] };
  }

  const merged = mergeClientManifest(ours, theirs);

  return merged.content === undefined
    ? leftOver(path, 'source', merged.why)
    : { file, kind, content: merged.content, settled: true, how: merged.how, blocks: [] };
}

function byKeys(path: ConflictedPath & { ours: string; theirs: string }, kind: 'slices' | 'stored-events'): Resolution {
  const merged =
    kind === 'slices'
      ? mergeSlicesRows(path.base ?? '', path.ours, path.theirs)
      : mergeStoredEventsLock(path.ours, path.theirs);

  if ('text' in merged) {
    const how =
      kind === 'slices'
        ? 'slices rows: merged row by row, each status the furthest of both sides'
        : 'stored-events lock: the versions of both sides';

    return { file: path.file, kind, content: merged.text, settled: true, how, blocks: [] };
  }

  return leftOver(path, kind, `both sides changed ${merged.conflicts.join(', ')} differently`);
}

/**
 * A source or a mixed document: the conflicts inside generated regions settled, the others left.
 * In code, a region the lines of both sides would leave with a declaration open is merged
 * declaration by declaration, and what the two sides do not agree on there is left.
 */
function inRegions(path: ConflictedPath, kind: ConflictClass, repo: MergeRepository): Resolution {
  const text = path.merged ?? '';

  const declared = isCode(path.file, kind)
    ? settleDeclarations(path, repo.top)
    : { content: text, held: NONE_HELD, merged: false };

  const { held } = declared;
  let lines = false;

  const byLines = (block: ConflictBlock, region: string): string[] => {
    lines = true;

    return registryUnion(block, region);
  };

  const choose =
    kind === 'mixed'
      ? (block: ConflictBlock) => block.theirs
      : (block: ConflictBlock, region: string) => (held.has(region) ? undefined : byLines(block, region));

  const settled = settleRegions(conflictBlocks(declared.content), choose);
  const content = settled.flatMap((segment) => (segment.kind === 'settled' ? segment.lines : segment.raw)).join('\n');
  const left = blocksOf(conflictBlocks(content));

  if (left.length === 0 && content !== text) {
    const how = howSettled(kind, { declarations: declared.merged, lines });

    return { file: path.file, kind: kind === 'mixed' ? kind : 'registry', content, settled: true, how, blocks: [] };
  }

  return {
    ...leftOver(path, kind, held.size === 0 ? OUTSIDE : `a conflict in the declarations of ${regionsNamed(held)}`),
    content: content === text ? undefined : content,
    blocks: left,
    ...adviceOf(held, left.length),
  };
}

const NONE_HELD: ReadonlyMap<string, HeldRegion> = new Map();

/** A source the kit reads brackets in, TypeScript, JavaScript or a schema of Prisma: prose and data keep the union of lines. */
function isCode(file: string, kind: ConflictClass): boolean {
  return kind !== 'mixed' && /\.(?:[cm]?[jt]sx?|prisma)$/.test(file);
}

const OUTSIDE = 'a conflict outside any generated region';

/** What settled the regions of a file: the trunk's side in a document, else the declarations of some, the lines of others. */
function howSettled(kind: ConflictClass, by: { declarations: boolean; lines: boolean }): string {
  if (kind === 'mixed') {
    return 'generated regions: trunk side, regenerated at the end';
  }

  const lines = 'the lines of both sides kept';
  const declarations = 'the declarations of both sides kept, each one whole';

  return `generated registry: ${by.declarations ? (by.lines ? `${declarations}, and ${lines}` : declarations) : lines}`;
}

function regionsNamed(held: ReadonlyMap<string, HeldRegion>): string {
  const names = [...held].flatMap(([name, { advice }]) => (advice === '' ? [] : [`\`${name}\``]));

  return `the region${names.length === 1 ? '' : 's'} ${names.join(', ')}`;
}

/** How to settle what regions of declarations leave, and the conflicts that lie elsewhere. */
function adviceOf(held: ReadonlyMap<string, HeldRegion>, left: number): { advice?: string } {
  if (held.size === 0) {
    return {};
  }

  const regions = [...held.values()].filter(({ advice }) => advice !== '');
  const counted = regions.reduce((count, region) => count + region.blocks, 0);
  const elsewhere = left > counted ? ['For the other hunks, write the lines that keep the intent of each side.'] : [];

  return { advice: [...regions.map(({ advice }) => advice), ...elsewhere].join(' ') };
}

/** Why a path without text on both sides is left to a person. */
function oneSideMissing(path: ConflictedPath): string {
  if (path.binary) {
    return 'a side is not text';
  }

  return `${path.ours === undefined ? 'this branch' : 'the trunk'} deleted it, the other side changed it`;
}

function leftOver(path: ConflictedPath, kind: ConflictClass, why: string): Resolution {
  return {
    file: path.file,
    kind,
    content: undefined,
    settled: false,
    how: why,
    blocks: blocksOf(conflictBlocks(path.merged ?? '')),
  };
}

function blocksOf(segments: readonly Segment[]): ConflictBlock[] {
  return segments.filter((segment) => segment.kind === 'conflict');
}
