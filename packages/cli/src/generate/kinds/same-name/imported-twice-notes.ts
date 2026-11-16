import type { Config } from '../../../config';
import { namedBindingsOf } from '../../../migration';
import type { Workspace } from '../../../workspace';
import { regionOf } from './region-of';
import { workspaceSources } from './workspace-sources';

/**
 * On TypeORM the kit writes no name of the schema index after a merge, in `merge-trunk` or
 * `init --force`: it cannot tell by the code whether two imports of one name are two entities or
 * one. Each name the region of the imports gives more than once is said, once, with the files it
 * comes from, and what to write by hand either way. Answers nothing when no name is given twice.
 */
export function importedTwiceNotes(ws: Workspace, config: Config): string[] {
  const index = `${config.platformDir}/database/schema.ts`;
  const sources = workspaceSources(ws, config);

  const imports = namedBindingsOf(regionOf(ws.read(index) ?? '', 'imports'), 'import').flatMap(({ source, names }) => {
    const resolved = sources.resolve(index, source);
    const file = resolved.kind === 'file' ? resolved.path : source;

    return names.map(({ local }) => ({ local, file }));
  });

  const twice = [...new Set(imports.map(({ local }) => local))].filter(
    (local) => imports.filter((held) => held.local === local).length > 1,
  );

  return twice.map((local) => {
    const files = imports.filter((held) => held.local === local).map(({ file }) => file);

    return `${index}: imports \`${local}\` ${files.length} times (from ${files.join(', ')}); the kit writes no name on TypeORM after a merge: if they are distinct entities, import each but one under its own name and list that name in \`entities\`; if they are one entity, take out the extra import.`;
  });
}
