import type { IndexReading } from './index-reading';
import { notSettled } from './not-settled';

/** What the kit knows of an index it does not read with certainty, and the names concerned. */
interface Unread {
  readonly reading: IndexReading;
  /** Why something is not read with certainty, each with its file. */
  readonly unread: readonly string[];
  /** The names what is not read may export: written as a word in it, or anything, for a module the kit does not look into. */
  readonly may: readonly string[];
  /** The names the files read with certainty share among them. */
  readonly shared: readonly string[];
  /** In a merge, the value the trunk exports under each name, by the place that declares it. */
  readonly keeps?: ReadonlyMap<string, string>;
}

/**
 * The one note of an index the kit does not read with certainty, in `generate`, `init --force` and
 * `merge-trunk`: what it does not read, the names that may be shared and the files that hold them,
 * the names shared among what was read, and what must hold, with no line to copy: the kit cannot
 * know the right ones.
 */
export function unreadNote({ reading, unread, may, shared, keeps }: Unread): string {
  const names = [...new Set([...may, ...shared])];
  const which = names.length === 1 ? 'that name' : 'one of those names';

  const because = [
    `it does not read with certainty ${unread.join('; ')}${mayExport(reading, may)}.`,
    sharedAmong(reading, shared),
    hiddenByTheIndex(reading, names),
    `Each table of ${which} needs a line by name in the index: ${keepers(names, keeps)}, each other one takes a name of its own`,
  ]
    .filter((part) => part !== '')
    .join(' ');

  return notSettled({ index: reading.index, because, lines: [] });
}

/** What what is not read may export, with the files read with certainty that hold the same names. */
function mayExport(reading: IndexReading, may: readonly string[]): string {
  if (may.length === 0) {
    return '';
  }

  const holders = holdersOf(reading, may);
  const as = holders.length === 0 ? '' : `, as ${holders.join(', ')} ${holders.length === 1 ? 'does' : 'do'}`;

  return `, which may export ${quoted(may)}${as}`;
}

/** The names the files read with certainty share among them, which the kit leaves while what it does not read stands. */
function sharedAmong(reading: IndexReading, shared: readonly string[]): string {
  if (shared.length === 0) {
    return '';
  }

  const unreadFiles = reading.stars.filter(({ unread }) => unread.length > 0).map(({ file }) => `'${file}'`);

  const standing =
    unreadFiles.length === 0
      ? 'what it does not read stands'
      : `${unreadFiles.join(', ')} ${unreadFiles.length === 1 ? 'stands' : 'stand'}`;

  return `${quoted(shared)} ${shared.length === 1 ? 'is' : 'are'} shared by ${holdersOf(reading, shared).join(' and ')}; the kit writes no name while ${standing}.`;
}

/** A name the index declares itself hides any table of that name a file it re-exports whole holds. */
function hiddenByTheIndex(reading: IndexReading, names: readonly string[]): string {
  const own = names.filter((name) => reading.values.includes(name));

  return own.length === 0
    ? ''
    : `A table named ${quoted(own)} in a tables file is hidden by the index's own ${declared(own)}.`;
}

/** The files read with certainty that hold one of the names as a value, then the index itself when it declares one. */
function holdersOf(reading: IndexReading, names: readonly string[]): string[] {
  const stars = reading.stars.filter(
    ({ unread, symbols }) =>
      unread.length === 0 && symbols.some(({ name, kind }) => kind === 'value' && names.includes(name)),
  );

  // A line by name of the index from a file read with certainty holds the name as well as a file it re-exports whole.
  const given = reading.given.filter(
    (one) => one.file !== undefined && one.value !== undefined && names.includes(one.local) && !('unread' in one),
  );

  const files = [...stars, ...given].map(({ file }) => `'${file}'`);

  const own = names.filter((name) => reading.values.includes(name));

  return [...new Set(files), ...(own.length === 0 ? [] : [`the index itself (${declared(own)})`])];
}

/** Who keeps each name: the one that held it before; in a merge, the one of the trunk, by its file when the trunk reads it. */
function keepers(names: readonly string[], keeps: ReadonlyMap<string, string> | undefined): string {
  if (keeps === undefined) {
    return `the one that held ${names.length === 1 ? quoted(names) : 'the name'} before keeps it`;
  }

  const where = (name: string): string => {
    const value = keeps.get(name);

    return value === undefined ? 'as the index of the trunk exports it' : `'${value.slice(0, value.lastIndexOf('#'))}'`;
  };

  return names.length === 1
    ? `the one that held ${quoted(names)} on the trunk, ${where(names[0] ?? '')}, keeps it`
    : `on the trunk, ${names.map((name) => `\`${name}\`: ${where(name)}`).join('; ')} keep them`;
}

function declared(names: readonly string[]): string {
  return names.map((name) => `\`export const ${name}\``).join(', ');
}

function quoted(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(', ');
}
