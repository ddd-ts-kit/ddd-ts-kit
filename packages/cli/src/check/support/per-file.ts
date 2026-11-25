import type { Finding } from '../model/finding';
import type { Project } from '../model/project';
import type { SourceFile } from '../model/source-file';
import type { Violation } from '../model/violation';
import { reporter } from './reporter';
import { toViolations } from './to-violations';

/**
 * Runs a judgment on each source of the project and reports what it finds under the rule `ruleId`:
 * the walk of the engine, for the part of a rule that reads the tree.
 */
export function perFile(
  project: Project,
  ruleId: string,
  judge: (file: SourceFile) => readonly Finding[],
): Violation[] {
  const report = reporter(project, ruleId);
  const isNew = sharedOnce();

  return project.files.flatMap((file) => toViolations(report, file.path, judge(file).filter(isNew)));
}

/**
 * Several sources may lead to one finding on a file they share (the empty glossary of their
 * context): it is reported once, where the first of them is judged.
 */
function sharedOnce(): (finding: Finding) => boolean {
  const reported = new Set<string>();

  return ({ file, line, message }) => {
    const shared = `${file}:${line}:${message}`;

    if (file === undefined || !reported.has(shared)) {
      reported.add(shared);

      return true;
    }

    return false;
  };
}
