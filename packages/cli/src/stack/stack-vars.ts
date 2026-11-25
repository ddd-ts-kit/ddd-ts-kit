import {
  AUTHZ_STACKS,
  DI_STACKS,
  EVENT_SOURCING_MODES,
  HTTP_CACHE_STACKS,
  HTTP_STACKS,
  LITERAL_FORMS,
  LOGGERS,
  onKitContainer,
  ORM_STACKS,
  PRIVACY_MODES,
  QUEUE_ORMS,
  QUEUE_STORES,
  REFUSAL_FORMS,
  ROUTE_FORMS,
  RPC_STACKS,
  SCHEMA_FORMS,
  SEARCH_STACKS,
  STYLES,
  TENANCY_STRATEGIES,
  TEST_STACKS,
  VALIDATION_STACKS,
  VALUE_FORMS,
  VALUE_OBJECT_FORMS,
  type Config,
  type Stack,
} from '../config';
import { diEntry } from '../generate/di-entry';
import { packageManagerVars } from '../package-manager/package-manager-vars';
import type { RenderContext } from '../templating';
import { aliasVars } from './alias-vars';
import { auditVars } from './audit-vars';
import { authenticationVars } from './authentication-vars';
import { brokerVars } from './broker-vars';
import { cacheVars } from './cache-vars';
import { declaresRoles } from './declares-roles';
import { endToEndVars } from './end-to-end-vars';
import { errorVars } from './error-vars';
import { eventVars } from './event-vars';
import { ORM_MEMBERS } from '../orm/orm-members';
import { one } from './one';
import { persistenceVars } from './persistence-vars';
import { redisVars } from './redis-vars';
import { filesVars } from './files-vars';
import { usesLegacyDecorators } from './uses-legacy-decorators';

/** The line width of the formatter of a generated project (`biome.json`, `lineWidth`). */
const FORMATTED_WIDTH = 120;

/** The choices of the stack as template variables: what every template of `init` and of `generate` reads. */
export function stackVars(config: Config): RenderContext {
  const { validation, di, tests, orm, authz, style, logger } = config.stack;
  const legacy = usesLegacyDecorators(config);

  return {
    style: one(style, STYLES),
    assembly: assemblyVars(config),
    decorators: { legacy, standard: !legacy },
    ...edgeVars(config),
    validation: one(validation, VALIDATION_STACKS),
    di: {
      ...one(di, DI_STACKS),
      container: onKitContainer(config),
      entry: diEntry(config),
    },
    orm: ormVars(orm),
    events: eventVars(config),
    authn: authenticationVars(config),
    authz: { ...one(authz, AUTHZ_STACKS), roles: declaresRoles(config) },
    broker: brokerVars(config),
    cache: cacheVars(config),
    files: filesVars(config),
    redis: redisVars(config),
    endToEnd: endToEndVars(config),
    audit: auditVars(config),
    errors: errorVars(config),
    ...modelWritingVars(config),
    routes: routeVars(config),
    presentation: presentationVars(config),
    logger: one(logger, LOGGERS),
    pm: packageManagerVars(config),
    tests: { ...one(tests, TEST_STACKS), module: tests === 'jest' ? '@jest/globals' : 'vitest' },
    config: platformPaths(config),
    alias: aliasVars(config),
    persistence: persistenceVars(config),
    ...platformVars(config),
    ...backgroundVars(config),
  };
}

/** The ORM of the stack: which one, any at all, and whether it is one that reaches a database. */
function ormVars(orm: Stack['orm']): RenderContext {
  return {
    ...one(orm, ORM_STACKS),
    any: orm !== 'none',
    database: ORM_MEMBERS[orm].database !== undefined,
  };
}

/** The tenants the storage confines to, the read models of OpenSearch, the event store and the requests of a data subject, and the hand-wired foundations. */
function platformVars(config: Config): RenderContext {
  const { tenancy, eventSourcing, privacy, search } = config.stack;

  return {
    tenancy: { ...one(tenancy, TENANCY_STRATEGIES), any: tenancy !== 'none' },
    search: one(search, SEARCH_STACKS),
    eventSourcing: one(eventSourcing, EVENT_SOURCING_MODES),
    privacy: one(privacy, PRIVACY_MODES),
    platformJobs: { any: platformJobsOf(config) },
    foundations: { founded: foundedUnion(founded(config)) },
  };
}

/**
 * The platform registers jobs of its own: the purge of staged files, the verification and the
 * archive of an audit trail kept in a database, the purge of what outlived its retention, of what
 * was published and of what finished.
 */
function platformJobsOf(config: Config): boolean {
  const { storage, privacy } = config.stack;

  return storage !== 'none' || privacy === 'on' || auditVars(config)['sql'] === true || keepsItsWork(config);
}

/** The platform keeps rows of its own work beyond the process: the records of the outbox, the jobs of a stored queue. */
function keepsItsWork(config: Config): boolean {
  const { events, queue } = config.stack;

  return events === 'outbox' || queue !== 'memory';
}

/** The members of the platform the hand-wired foundations hand on as they are, in the order the union names them. */
function founded(config: Config): readonly string[] {
  const { cache, http, audit, errors, eventSourcing, search } = config.stack;
  const rateLimit = cache === 'redis' && http !== 'none';

  return [
    'scope',
    'clock',
    'ids',
    'logger',
    'metrics',
    ...(errors === 'sentry' ? ['errors'] : []),
    'cache',
    'jobs',
    ...(rateLimit ? ['rateLimiter'] : []),
    ...(audit === 'on' ? ['audit'] : []),
    ...(eventSourcing === 'on' ? ['eventSourcing'] : []),
    ...(search === 'opensearch' ? ['search'] : []),
  ];
}

/** The `Founded` union as the formatter lays it out: one line while it fits the width of the project, one member per line beyond. */
function foundedUnion(members: readonly string[]): string {
  const quoted = members.map((member) => `'${member}'`);
  const oneLine = `type Founded = ${quoted.join(' | ')};`;

  return oneLine.length <= FORMATTED_WIDTH ? oneLine : `type Founded =\n${quoted.map((m) => `  | ${m}`).join('\n')};`;
}

/** Where the background jobs run and are kept. */
function backgroundVars(config: Config): RenderContext {
  return {
    worker: { on: config.worker, off: !config.worker },
    queue: queueVars(config),
    housekeeping: { any: keepsItsWork(config) },
  };
}

/**
 * `stored`: the jobs leave the memory of the process. `processTable`: the instances of the
 * process managers go to the database whenever the jobs leave memory and the ORM keeps them.
 */
function queueVars(config: Config): RenderContext {
  const { queue, orm } = config.stack;

  return {
    ...one(queue, QUEUE_STORES),
    stored: queue !== 'memory',
    processTable: queue !== 'memory' && QUEUE_ORMS.includes(orm),
  };
}

/** How the code is written: its refusals, its shared schemas, its value objects, its closed values. */
function modelWritingVars(config: Config): RenderContext {
  const { refusals, schemas, valueObjects, literals, values } = config.stack;

  return {
    refusals: one(refusals, REFUSAL_FORMS),
    schemas: one(schemas, SCHEMA_FORMS),
    valueObjects: one(valueObjects, VALUE_OBJECT_FORMS),
    literals: one(literals, LITERAL_FORMS),
    values: one(values, VALUE_FORMS),
  };
}

/**
 * `listed`: the routes of a context are a list written in `<context>.routes.ts`. Declared
 * controllers reach the application by themselves, and the composition root mounts them in
 * either form of routes, so a project of function routes can write its first controller.
 */
function routeVars(config: Config): RenderContext {
  const { routes, style, http, audit } = config.stack;
  const declaredControllers = http !== 'none' && style === 'declared';

  return {
    ...one(routes, ROUTE_FORMS),
    listed: http !== 'none' && !(style === 'declared' && routes === 'controllers'),
    declaredControllers,
    mountsControllers: declaredControllers || (http !== 'none' && audit === 'on' && routes !== 'functions'),
  };
}

/**
 * `negotiated`: the boundary registers the representations of the kit; `forms`: the composition
 * root serves the forms of the routes. Either one decides the restricted fields through the
 * `Access` of the application, which `presentation-of.ts` of the platform builds.
 */
function presentationVars(config: Config): RenderContext {
  const { http, representations, forms, audit } = config.stack;
  const negotiated = http !== 'none' && representations === 'negotiated';
  const served = http !== 'none' && forms === 'on';
  const any = negotiated || served;

  // The HTTP boundary takes more than its five ports when the audit trail or the presentation joins them.
  return { negotiated, forms: served, any, widensEdge: any || audit === 'on' };
}

function assemblyVars(config: Config): RenderContext {
  const { style, assembly } = config.stack;

  return {
    barrel: style === 'declared' && assembly === 'barrel',
    discovery: style === 'declared' && assembly === 'discovery',
  };
}

/** The HTTP framework, the shared cache in front of it, and the procedures served next to it. */
function edgeVars(config: Config): RenderContext {
  const { httpCache, tenancy, rpc } = config.stack;
  // A multi-tenant application files its tags under the tenant, on the answers and on the purges alike.
  const perTenant = httpCache !== 'none' && tenancy !== 'none';

  return {
    http: httpVars(config),
    httpCache: { ...one(httpCache, HTTP_CACHE_STACKS), perTenant },
    rpc: one(rpc, RPC_STACKS),
  };
}

function httpVars(config: Config): RenderContext {
  const { http } = config.stack;

  return {
    ...one(http, HTTP_STACKS),
    any: http !== 'none',
    plain: http === 'express' || http === 'fastify' || http === 'hono',
  };
}

function platformPaths(config: Config): RenderContext {
  return {
    sourceRoot: config.sourceRoot,
    contextsDir: config.contextsDir,
    sharedKernelDir: config.sharedKernelDir,
    platformDir: config.platformDir,
    importAlias: config.importAlias,
  };
}
