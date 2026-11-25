import type { ProjectFacts } from '../model/project';
import type { SourceFile } from '../model/source-file';
import { importedFrom } from './imported-from';

/** The source that declares the class `name` used in `file`: the file its import points to, or the file itself. */
export function sourceDeclaring(project: ProjectFacts, file: SourceFile, name: string): SourceFile {
  const imported = importedFrom(file, name)?.target;

  return (imported?.kind === 'file' ? project.sourceAt(imported.path) : undefined) ?? file;
}
