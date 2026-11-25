import { ORM_STACKS } from '../config';
import { ORM_MEMBERS } from '../orm/orm-members';

/** The ORMs the generated persistence is written for: each reaches a database through a URL. */
export const WITH_DATABASE: readonly string[] = ORM_STACKS.filter((orm) => ORM_MEMBERS[orm].database !== undefined);
