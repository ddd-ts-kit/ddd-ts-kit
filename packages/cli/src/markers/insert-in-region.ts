import { fitBlock } from '../layout';
import { marker } from './marker';
import { mergeImports } from './merge-imports';

/** Regions made of independent lines (imports): each line is added unless already there. */
const LINEWISE = new Set(['imports']);

/** Regions made of statements: each block added there is a paragraph, set apart by a blank line. */
const PARAGRAPHS = new Set(['registrations', 'infrastructure', 'handlers', 'reactions', 'jobs', 'start']);

/**
 * Inserts `block` at the end of the region, with the indentation of its closing marker.
 * Returns undefined when the file has no such region (the user removed the markers).
 */
export function insertInRegion(content: string, region: string, block: string): string | undefined {
  const lines = content.split('\n');
  const open = lines.findIndex((line) => marker(region, false).test(line));
  const close = lines.findIndex((line, index) => index > open && marker(region, true).test(line));

  if (open === -1 || close === -1) {
    return undefined;
  }

  const indent = /^\s*/.exec(lines[close] ?? '')?.[0] ?? '';
  const indented = (line: string): string => (line.trim() === '' ? '' : `${indent}${line}`);
  const inside = lines.slice(open + 1, close);
  const written = trimBlankEdges(block.split('\n'));

  if (written.length === 0) {
    return content;
  }

  const merged = LINEWISE.has(region)
    ? mergeImports(
        inside.map((line) => line.trim()),
        written,
      ).map(indented)
    : [...inside, ...added(inside, additionTo(region, written, indent), lines.slice(0, open)).map(indented)];

  lines.splice(open + 1, close - open - 1, ...merged);

  return lines.join('\n');
}

const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;

interface Addition {
  readonly lines: readonly string[];
  /** Set apart from what the region already holds by a blank line. */
  readonly isParagraph: boolean;
  /** Opens with a statement on several lines, which the layout rules set apart from the statement before it, wherever that one stands. */
  readonly opensBroken: boolean;
}

/** What a block adds once laid out for the width left at the indentation of the region: a block of statements, or a statement that takes several lines, is a paragraph. */
function additionTo(region: string, written: readonly string[], indent: string): Addition {
  const lines = fitBlock(written, indent);
  const isBrokenStatement = lines.length > 1 && lines.at(-1)?.endsWith(';') === true;

  const opening = lines.find((line) => !COMMENT.test(line)) ?? '';

  return {
    lines,
    isParagraph: PARAGRAPHS.has(region) || written.length > 1 || isBrokenStatement,
    opensBroken: opening !== '' && !/[;,]$/.test(opening),
  };
}

/**
 * The lines a block adds to a region: none when its lines are already there, in order; a blank
 * line first when the block is a paragraph that follows what the region holds, or a statement on
 * several lines that opens the region right under a statement.
 */
function added(inside: readonly string[], addition: Addition, above: readonly string[]): string[] {
  const { lines, isParagraph, opensBroken } = addition;

  const written = (rows: readonly string[]): string =>
    rows
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .join('\n');

  if (`\n${written(inside)}\n`.includes(`\n${written(lines)}\n`)) {
    return [];
  }

  const follows = inside.some((line) => line.trim() !== '') ? isParagraph : opensBroken && endsWithAStatement(above);

  return [...(follows ? [''] : []), ...lines];
}

/** Whether the last line that is no comment is a statement that ends there: not a blank line, nor the opening of a block. */
function endsWithAStatement(above: readonly string[]): boolean {
  const last = above.findLast((line) => !COMMENT.test(line))?.trim() ?? '';

  return last.endsWith(';');
}

function trimBlankEdges(lines: readonly string[]): string[] {
  const first = lines.findIndex((line) => line.trim() !== '');
  const last = lines.findLastIndex((line) => line.trim() !== '');

  return first === -1 ? [] : lines.slice(first, last + 1);
}
