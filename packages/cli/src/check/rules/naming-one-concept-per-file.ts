import { declaredRoleOf } from '../../declared';
import { roleOf } from '../canonical/role-of';
import { classesOf } from '../declarations/classes-of';
import type { Finding } from '../model/finding';
import type { ProjectFacts } from '../model/project';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { inContext } from '../support/in-context';
import { isDeclaredStyle } from '../support/is-declared-style';
import { pathInContext } from '../support/path-in-context';
import { roleDirectory } from '../support/role-directory';
import { WITHOUT_MODULE } from '../../model-modules';

const EXPORTED_CLASS = /(?<![\w$.])export\s+(?:default\s+)?(?:abstract\s+)?class\s+([\w$]+)/g;

export const namingOneConceptPerFile: FileRule = {
  id: 'naming/one-concept-per-file',
  description:
    'One exported aggregate, entity, value object, event, handler or job per file, and one declared class per role file.',
  severity: 'error',
  doc: {
    why: 'One concept per file keeps the file name truthful and the diff of a change small. A second class in an aggregate file is usually an entity or a value object that deserves its own name and its own tests. In the declared style a role file is found by its name and holds one declared class: a second class carrying a declaration decorator in the same file is reported, whatever the role.',
    bad: `// invoice.aggregate.ts
export class Invoice {}
export class InvoiceLine {}
// application/authorization/invoice.policy.ts, declared style
@Policy(billingPermissions['invoice.void'], { name: 'billing.only-issuer-voids' })
export class OnlyIssuerVoidsPolicy {}
@Policy(billingPermissions['invoice.issue'], { name: 'billing.only-accountant-issues' })
export class OnlyAccountantIssuesPolicy {}`,
    good: `// invoice.aggregate.ts
export class Invoice {}
// ../entities/invoice-line.entity.ts
export class InvoiceLine {}`,
  },
  scope: 'file',
  judge(file, project) {
    if (!inContext(file.location) || file.isTest) {
      return [];
    }

    const exported = severalExportedClasses(file);

    return exported.length > 0 ? exported : severalDeclaredClasses(file, project);
  },
};

function severalExportedClasses(file: SourceFile): Finding[] {
  if (!inContext(file.location) || roleOf(roleDirectory(file.location))?.oneConcept !== true) {
    return [];
  }

  const classes = [...file.scan.code.matchAll(EXPORTED_CLASS)];
  const [first, second] = classes;

  if (first === undefined || second === undefined) {
    return [];
  }

  return [
    {
      line: file.scan.lineAt(second.index),
      message: `The file exports ${classes.length} classes (${classes.map((match) => match[1]).join(', ')}).`,
      fix: `Keep ${first[1] ?? 'the first class'} here and move each other class to its own file named after it.`,
    },
  ];
}

/** In the declared style a role file is found by its name and read for one class: a second declared class hides behind the first. */
function severalDeclaredClasses(file: SourceFile, project: ProjectFacts): Finding[] {
  if (!isDeclaredStyle(project) || declaredRoleOf(pathInContext(project, file) ?? '', WITHOUT_MODULE) === undefined) {
    return [];
  }

  const declared = classesOf(file.scan).filter(({ decorations }) => decorations.length > 0);
  const [first, second] = declared;

  if (first === undefined || second === undefined) {
    return [];
  }

  return [
    {
      line: second.line,
      message: `The file declares ${declared.length} classes (${declared.map(({ name }) => name).join(', ')}).`,
      fix: `Keep ${first.name} here and move each other declared class to its own role file named after it, so that each one is found by the name of its file.`,
    },
  ];
}
