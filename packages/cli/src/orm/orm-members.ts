import type { Stack } from '../config';
import { drizzle } from './members/drizzle';
import { knex } from './members/knex';
import { prisma } from './members/prisma';
import { typeorm } from './members/typeorm';
import type { OrmMember } from './orm-member';

/** A storage of the project's own, behind its ports: the kit writes none of it. */
const custom: OrmMember = {};

/** No storage at all: the adapters of the project keep what they hold in memory. */
const none: OrmMember = {};

/** The ORM family, one member per choice of `--orm`: a new one answers here what the CLI asks of each. */
export const ORM_MEMBERS: Readonly<Record<Stack['orm'], OrmMember>> = { drizzle, knex, prisma, typeorm, custom, none };
