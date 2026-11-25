import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../../config';
import type { Project, ProjectFacts } from '../model/project';
import type { SourceFile } from '../model/source-file';
import { loadSourceFile } from './load-source-file';

/**
 * Answers the source at a path: the one the project loaded, or, when only one file was loaded
 * (`check-file`), the file an import of it points to, read from disk once.
 */
export function sourceReader({
  root,
  config,
  files,
}: Pick<Project, 'root' | 'config' | 'files'>): ProjectFacts['sourceAt'] {
  const readFromDisk = new Map<string, SourceFile | undefined>();

  return (file) => {
    const loaded = files.find((candidate) => candidate.path === file);

    if (loaded !== undefined) {
      return loaded;
    }

    if (!readFromDisk.has(file)) {
      readFromDisk.set(file, readSource(root, config, file));
    }

    return readFromDisk.get(file);
  };
}

function readSource(root: string, config: Config, file: string): SourceFile | undefined {
  try {
    return loadSourceFile(config, file, fs.readFileSync(path.join(root, file), 'utf8'));
  } catch {
    return undefined;
  }
}
