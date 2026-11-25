import type { Finding } from '../model/finding';
import type { Rule } from '../model/rule';
import type { RuleDoc } from '../model/rule-doc';
import type { SourceFile } from '../model/source-file';
import { inLayers } from '../support/in-layers';
import { perFile } from '../support/per-file';
import { forbiddenNamedImports } from './forbidden-named-imports';
import { forbiddenUses } from './forbidden-uses';
import type { PurityTable } from './reference/purity-table';

/**
 * The three purity/* rules share one mechanism: the globals and the modules their table forbids
 * in domain/ and application/. The table, and the words of a finding, are those of the ESLint
 * plugin; this checker reads the text where the plugin reads the syntax tree.
 */
export function definePurityRule(table: PurityTable, doc: RuleDoc): Rule {
  return {
    id: table.id,
    description: table.description,
    severity: 'error',
    doc,
    scope: 'file',
    run: (project) =>
      perFile(project, table.id, (file) => {
        const layer = inLayers(file, ['domain', 'application'])?.layer;

        return layer === undefined
          ? []
          : [...forbiddenModules(file, table, layer), ...forbiddenCode(file, table, layer)];
      }),
  };
}

function forbiddenCode(file: SourceFile, table: PurityTable, layer: string): Finding[] {
  return [...forbiddenNamedImports(file.scan, table), ...forbiddenUses(file.scan, table)].map(({ at, what }) => ({
    line: file.scan.lineAt(at),
    message: `${what} is used in the ${layer} layer.`,
    fix: table.fix,
  }));
}

function forbiddenModules(file: SourceFile, table: PurityTable, layer: string): Finding[] {
  return file.imports.flatMap(({ target, line }) => {
    if (target.kind === 'file') {
      return [];
    }

    const name = target.kind === 'builtin' ? (target.name.replace(/^node:/, '').split('/')[0] ?? '') : target.name;

    return table.modules.includes(name)
      ? [{ line, message: `"${target.name}" is imported in the ${layer} layer.`, fix: table.fix }]
      : [];
  });
}
