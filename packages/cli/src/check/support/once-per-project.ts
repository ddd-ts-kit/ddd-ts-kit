import type { Project } from '../model/project';

/**
 * What a rule reads of a project once, however many of its sources it then judges: a folder of the
 * disk, a file beside the sources. The engine hands a file rule one source at a time, and the
 * reading is kept with the project it was made for.
 */
export function oncePerProject<Read>(read: (project: Project) => Read): (project: Project) => Read {
  const known = new WeakMap<Project, Read>();

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
