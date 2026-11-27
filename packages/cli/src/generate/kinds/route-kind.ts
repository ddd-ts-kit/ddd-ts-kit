import { CONFIG_FILE, type Config } from '../../config';
import { CliError } from '../../cli-error';
import { emit, type Output } from '../emit';
import { label } from '../label';
import { named } from '../named';
import type { KindFlags } from '../read-request';
import type { Reading, Scope } from '../scope';
import { searchedElements } from '../searched-elements';
import { vars } from '../vars';
import { wire } from '../wire';
import { dtoClasses } from './route/dto-classes';
import { sharesSchemas } from './route/shares-schemas';
import { findUseCase } from './route/find-use-case';
import { parseEndpoint } from './route/parse-endpoint';
import { planController, type AskedController } from './route/plan-controller';
import { routeVars, type RouteParts } from './route/route-vars';
import { writeController } from './route/write-controller';
import { writeNestController } from './route/write-nest-controller';
import { SEARCH_LINE_LIBRARIES } from './route/search-line-libraries';
import { defineKind } from '../define-kind';

/** What a route and a controller both declare: the use case they call, the endpoint and how it answers. */
const CALLING_A_USE_CASE = {
  scope: 'context',
  positionals: ['UseCaseName'],
  options: {
    method: { type: 'string', value: '<GET|POST|PUT|PATCH|DELETE>' },
    path: { type: 'string' },
    command: { type: 'boolean' },
    query: { type: 'boolean' },
    group: { type: 'string', value: '<Name>' },
    mapper: { type: 'boolean' },
    serializer: { type: 'boolean' },
    cache: { type: 'string', value: 'public|private|no-store' },
  },
  shownOptions:
    '--method <GET|POST|PUT|PATCH|DELETE> --path <path> [--command|--query] [--group <Name>] [--mapper] [--serializer] [--cache public|private|no-store]',
  writesInModules: true,
} as const;

type RouteScope = Scope<KindFlags<typeof CALLING_A_USE_CASE.options>>;

type RouteForm = Config['stack']['routes'];

export const routeKind = defineKind({
  name: 'route',
  summary:
    'An HTTP route calling an existing use case through its bus, with its spec: under "stack.routes": "controllers", a controller class in its folder, behind the guards of its route group; under "functions", a defineRoute function and its registration; under "nest", a Nest controller whose method takes and answers what its signature names, listed in the generated <context>.controllers.ts. After `generate command <context> <UseCaseName>` or `generate query <context> <UseCaseName>`; with --group, after `generate route-group <context> <Name>`.',
  ...CALLING_A_USE_CASE,
  run: (scope, request) => writeRoute(scope, request.args[1] ?? '', scope.config.stack.routes),
});

/** The same as `route`, always as a controller class: for a project of function routes that moves one route at a time. */
export const controllerKind = defineKind({
  name: 'controller',
  summary:
    'A controller class calling an existing use case through its bus, whatever "stack.routes" says: its folder, its schemas, its spec, and its route group when it is new. After `generate command <context> <UseCaseName>` or `generate query <context> <UseCaseName>`; with --group, after `generate route-group <context> <Name>`.',
  ...CALLING_A_USE_CASE,
  run: (scope, request) => writeRoute(scope, request.args[1] ?? '', 'controllers'),
});

type WriteRoute = (scope: RouteScope, parts: RouteParts, asked: AskedController) => void;

/** How each form of routes writes one: a Nest controller, a controller class, or a function and its registration. */
const WRITTEN_AS: Readonly<Record<RouteForm, WriteRoute>> = {
  nest: (scope, parts, asked) => writeNestController(scope, planController(scope, parts, asked)),
  controllers: (scope, parts, asked) => writeController(scope, planController(scope, parts, asked)),
  functions: writeFunctionRoute,
};

/** The route of the use case the input names, in the form given. */
function writeRoute(scope: RouteScope, input: string, form: RouteForm): void {
  assertHttpStack(scope);

  const name = label(scope, input, { what: 'use case', strip: ['route', 'controller', 'handler'] });
  const { flags } = scope;

  const parts = {
    name,
    endpoint: parseEndpoint({ method: flags.text('method'), path: flags.text('path') }),
    useCase: findUseCase(scope, name, { command: flags.flag('command'), query: flags.flag('query') }),
  };

  WRITTEN_AS[form](scope, parts, {
    mapper: flags.flag('mapper'),
    serializer: flags.flag('serializer'),
    cache: flags.text('cache'),
  });
}

/** A `defineRoute` function, its spec and its registration. */
function writeFunctionRoute(scope: RouteScope, parts: RouteParts): void {
  assertNoCachePolicy(scope);

  const context = vars(scope, {
    name: named(parts.name),
    route: routeVars(scope, parts),
    search: {
      customSchema: !SEARCH_LINE_LIBRARIES.has(scope.config.stack.validation),
      ...searchedElements(parts.name),
    },
  });

  emit(scope, context, routeOutputs(scope, parts));
  wire(scope, 'route', context);
}

function assertNoCachePolicy(scope: Scope<Reading<'cache'>>): void {
  if (scope.flags.text('cache') === undefined) {
    return;
  }

  throw new CliError(
    '--cache writes the cache policy of a controller, and this project writes its routes as functions.',
    'Write `cache` in the spec of the route, or generate it as a controller: `ddd-ts-kit generate controller ...`.',
  );
}

function assertHttpStack(scope: Scope): void {
  if (scope.config.stack.http !== 'none') {
    return;
  }

  throw new CliError(
    'This project has no HTTP stack (stack.http is "none").',
    `Set stack.http to express, fastify or nest in ${CONFIG_FILE} and add the matching platform files, or expose the use case another way.`,
  );
}

function routeOutputs(scope: Scope, { name, endpoint, useCase }: RouteParts): Output[] {
  const { validation } = scope.config.stack;
  const dtos = validation === 'class-validator' ? dtoClasses(endpoint, useCase, sharesSchemas(scope.config)) : [];

  return [
    [`route/route.${useCase.isSearch ? 'search' : validation}.ts.tpl`, `presentation/http/${name.kebab}.route.ts`],
    ...dtos.map((role): Output => [`route/dto.${role}.ts.tpl`, `presentation/http/${name.kebab}-${role}.dto.ts`]),
    ['route/route.spec.ts.tpl', `test/unit/${name.kebab}.route.spec.ts`],
  ];
}

/** The same as `route`, always as a controller class: for a project of function routes that moves one route at a time. */
