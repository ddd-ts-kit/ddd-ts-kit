import type { ProjectFacts } from '../model/project';

/**
 * What a rule reads of a project once, however many of its sources it then judges: a folder of the
 * disk, a file beside the sources. The engine hands a file rule one source at a time, and the
 * reading is kept with the project it was made for.
 */
export function oncePerProject<Read>(read: (project: ProjectFacts) => Read): (project: ProjectFacts) => Read {
  const known = new WeakMap<ProjectFacts, Read>();

  return (project) => {
    const already = known.get(project);

    if (already !== undefined) {
      return already;
    }

    const fresh = read(project);

    known.set(project, fresh);

    return fresh;
  };
}
