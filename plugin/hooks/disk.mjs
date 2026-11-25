// What the guard reads of the disk: a regular file within a bound, a folder only this user writes,
// the real place a path or a link leads to. Every mode reads it.
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const WINDOWS = process.platform === 'win32';

// The most of a file of state, a scope file or a plan the guard reads: past it, it is not read.
const STATE_BYTES = 16 * 1024 * 1024;

export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// The content of a regular file, read through one descriptor that never waits (a FIFO opens at
// once) and never past `limit` bytes: the file measured is the file read. A device, a FIFO, a folder
// or a file that cannot be opened has no content.
export function readBounded(path, limit, encoding = 'utf8') {
  let descriptor;
  let read = {};
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = fstatSync(descriptor);
    if (stat.isFile()) {
      read = stat.size > limit ? { tooLarge: stat.size } : { content: readFileSync(descriptor, encoding) };
    }
  } catch {
    // Missing, or not readable by this user: no content.
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }
  return read;
}

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readJson(path) {
  const { content } = readBounded(path, STATE_BYTES);
  return content === undefined ? undefined : parseJson(content);
}

// A folder that only this user or the system writes: owned by this user or by root, and not writable
// by others. A folder not made yet is no other user's. Windows has no such owner: every folder is.
export function isOwnFolder(directory) {
  const stat = statSync(directory, { throwIfNoEntry: false });
  return (
    WINDOWS || stat === undefined || ((stat.mode & 0o002) === 0 && (stat.uid === 0 || stat.uid === process.getuid()))
  );
}

export function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// The text of a file, or `otherwise` when it cannot be read: missing, a folder, a device, larger than
// the guard reads, or not readable by this user.
export function readText(path, otherwise) {
  return readBounded(path, STATE_BYTES).content ?? otherwise;
}

export function realOf(path) {
  try {
    return realpathSync(path);
  } catch {
    // Not there yet: where it would be is judged as it is spelled.
    return path;
  }
}

// Where a write lands: the real path of the place, its links followed, a link that points nowhere yet
// followed to where it would create its file.
export function realPlace(place, depth = 0) {
  try {
    return realpathSync(place);
  } catch {
    // Not there: a link that points nowhere yet, or a file to create under its real folder.
  }
  const target = linkTarget(place);
  if (target !== undefined && depth < 8) {
    return realPlace(resolve(dirname(place), target), depth + 1);
  }
  return join(realPlace(dirname(place), depth), basename(place));
}

function linkTarget(place) {
  try {
    return readlinkSync(place);
  } catch {
    return undefined;
  }
}

export function filesIn(folder) {
  try {
    return readdirSync(folder).map((name) => join(folder, name));
  } catch {
    return [];
  }
}
