import { defaultSeverity } from '../catalogue/default-severity';
import { severityOf } from '../catalogue/severity-of';
import type { Project } from '../model/project';
import { fileSeverity } from './file-severity';
import { locate } from './locate';
import { sourceReader } from './source-reader';

type Asked = 'severity' | 'defaultSeverity' | 'fileSeverity' | 'locate' | 'sourceAt';

/**
 * Gives what was loaded the questions every rule asks: the severity of a rule, on a file or not, the
 * place of a file and the source at a path.
 */
export function assembleProject(loaded: Omit<Project, Asked>): Project {
  const { config } = loaded;

  return {
    ...loaded,
    severity: (ruleId) => severityOf({ id: ruleId, severity: defaultSeverity(ruleId) }, config.rules),
    defaultSeverity,
    fileSeverity: (ruleId, file) => fileSeverity(config, ruleId, file),
    locate: (file) => locate(config, file),
    sourceAt: sourceReader(loaded),
  };
}
