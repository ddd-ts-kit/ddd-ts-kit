import { stageIfAllowed, type WriteOptions } from './stage-if-allowed';

/**
 * Writes the file, its folders first, whole or not at all: the content goes to a temporary file
 * beside it (`stageIfAllowed`), which is then renamed into place, so that a process stopped half
 * way leaves the earlier content or the new one, never a part. False when the path is protected
 * here, any other error thrown, the temporary file never left behind.
 */
export function writeIfAllowed(absolute: string, content: string, options: WriteOptions = {}): boolean {
  const staged = stageIfAllowed(absolute, content, options);

  if (staged === undefined) {
    return false;
  }

  try {
    return staged.land();
  } finally {
    staged.discard();
  }
}
