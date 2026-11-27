import { readControllers } from '../../describe/read-controllers';
import { CliError } from '../../cli-error';
import { fitStatement } from '../../layout';
import { toName, type Name } from '../../naming';
import type { RenderContext } from '../../templating';
import { renderTemplate } from '../../templating';
import { label } from '../label';
import { named } from '../named';
import type { Reading, Scope } from '../scope';
import { vars } from '../vars';
import { actingRole } from './e2e/acting-role';
import { jobSpec, type Support } from './e2e/job-spec';
import { reactionOf } from './e2e/reaction-of';
import { heldScenarios } from './e2e/held-scenarios';
import { stillRefusing } from './e2e/still-refusing';
import { tracedCommand } from './traced-command';
import { isControlPlane } from '../../config/is-control-plane';
import { declaredModules } from '../../model-modules';
import { defineKind } from '../define-kind';

export const e2eKind = defineKind({
  name: 'e2e',
  summary:
    'An end-to-end spec on the whole application, in test/e2e/ at the project root: driving the route of a use case, or, for a use case no route reaches, publishing the integration event its handler receives (--event names it when several do) or running the job that sends its command, the scheduled one at once and the background one with what is due on its queue (--job names one job, also for a use case a route reaches, and writes test/e2e/<use-case>-<job>.e2e.spec.ts). After `generate route <context> <UseCaseName>`, or the `generate integration-handler`, `generate job` or `generate background-job` that starts its use case.',
  scope: 'context',
  positionals: ['UseCaseName'],
  options: { event: { type: 'string', value: '<eventType>' }, job: { type: 'string', value: '<JobName>' } },
  shownOptions: '[--event <eventType> | --job <JobName>]',
  writesInModules: false,
  run: (scope, request) => {
    const name = label(scope, request.args[1] ?? '', { what: 'use case', strip: ['route', 'controller', 'handler'] });
    const file = `${scope.dir}/presentation/http/${name.kebab}.route.ts`;
    const endpoint = namesItsStarter(scope) ? undefined : endpointOf(scope, name, file);

    noteSupport(scope, endpoint === undefined ? startedSpec(scope, name, file) : routeSpec(scope, name, endpoint));
  },
});

/** The spec of a use case no route reaches, or whose starter a flag names: it publishes the event its handler receives, or runs the jobs that send its command. Answers what it needs of the support. */
function startedSpec(scope: Scope<Reading<'event' | 'job'>>, name: Name, routeFile: string): readonly Support[] {
  const reaction = reactionOf(scope, name, routeFile);

  if ('jobs' in reaction) {
    const { file, content, needs } = jobSpec(scope, name, reaction);

    scope.ws.create(file, content);
    noteRefusing(scope, stillRefusing(scope, name), 'the end-to-end spec fails until it is written.');

    return needs;
  }

  const { handler, upstream, e2e } = reaction;
  const refusing = stillRefusing(scope, name, handler);
  const read = { name: named(name), upstream, e2e: { ...e2e, held: refusing.length > 0 } };
  const spec = renderTemplate('e2e/e2e-reaction.spec.ts.tpl', vars(scope, read));

  scope.ws.create(`test/e2e/${name.kebab}.e2e.spec.ts`, refusing.length > 0 ? heldScenarios(spec, /^'runs "/) : spec);
  noteRefusing(scope, refusing, HELD);

  return ['publish'];
}

/** The spec that drives the route of the use case: the support of any project serves it. */
function routeSpec(scope: Scope, name: Name, endpoint: Endpoint): readonly Support[] {
  const traced = tracedCommand(scope, name);
  const command = `{ name: 'command ${name.pascal}Command'${traced.saved} }`;
  const tree = spanTree(`${endpoint.method} ${endpoint.path}`, command);
  const { written: role, roleImport } = actingRole(scope);
  const namesRole = endpoint.protected === true && roleImport !== '';
  const actor = { role, roleImport, namesRole, tenant: tenantOf(scope) };
  const refusing = stillRefusing(scope, name);

  const held = refusing.length > 0;

  const spec = renderTemplate(
    'e2e/e2e.spec.ts.tpl',
    vars(scope, { name: named(name), e2e: { ...endpoint, ...traced, tree, ...actor, held } }),
  );

  // The 401 and the 403 are answered before the use case: only the scenarios that reach it wait.
  scope.ws.create(
    `test/e2e/${name.kebab}.e2e.spec.ts`,
    held ? heldScenarios(spec, /^'(?:is one trace|answers \d+ to [A-Z]+ )/) : spec,
  );

  noteRefusing(scope, refusing, HELD);

  return [];
}

const HELD =
  '`pending(...)` holds the scenarios of the end-to-end spec that wait for it, and fails them once it is written: remove it then.';

/** What the spec drives and is still as its generator left it: the output says so, and what the spec does about it. */
function noteRefusing(scope: Scope, refusing: readonly string[], consequence: string): void {
  for (const file of refusing) {
    scope.ws.note(`${file} still refuses (its TODO(domain)): ${consequence}`);
  }
}

/** True when a flag says what starts the use case: its route is then left aside. `--event` and `--job` name two different specs. */
function namesItsStarter(scope: Scope<Reading<'event' | 'job'>>): boolean {
  const event = scope.flags.text('event');
  const job = scope.flags.text('job');

  if (event !== undefined && job !== undefined) {
    throw new CliError(
      'generate e2e takes --event or --job, not both.',
      'A spec starts its use case one way: run the command once with --event <eventType>, once with --job <JobName>.',
    );
  }

  return event !== undefined || job !== undefined;
}

/** The tenant the actors of the spec act in: a tenant-scoped repository refuses a token without one. */
function tenantOf(scope: Scope): string {
  return scope.config.stack.tenancy === 'none' || isControlPlane(scope.config, scope.context.kebab)
    ? ''
    : ", tenantId: 'acme'";
}

const SUPPORT = 'test/e2e/support/start-application.ts';

/** How a project whose support was written before a function existed adds it by hand. */
const ADDED_BY_HAND: Readonly<Record<Support, string>> = {
  runJob: `${SUPPORT} has no runJob(name): add \`runJob(name: string): Promise<void>;\` to RunningApplication and implement it with \`async (name) => { await application.jobs.runNow(name); }\` on the composed application (\`jobs\` is its JobScheduler: \`platform.jobs\` by hand, \`container.resolve(JobScheduler)\` on tsyringe), as a new project has it.`,
  runDueJobs: `${SUPPORT} has no runDueJobs(): add \`runDueJobs(): Promise<string[]>;\` to RunningApplication and implement it on the queue worker of the composed application (\`application.container.resolve(QueueWorker)\` on a container; by hand, \`application.platform.backgroundJobs\` once \`runDue: () => worker.runDue()\` is among what \`jobs/create-background-work.ts\` answers): \`await worker.stop()\`, then \`await worker.runDue()\`, rejecting when the outcome of a run is not \`succeeded\` and answering the name of each job run, as a new project has it.`,
  publish: `${SUPPORT} has no publish(events): add \`publish(events: readonly IntegrationEvent[]): Promise<void>;\` to RunningApplication and implement it with \`(events) => application.eventBus.publish(events)\` on the composed application, as a new project has it.`,
};

/** What the spec needs of the support of the project: `init` writes it, older projects add what they lack by hand. */
function noteSupport(scope: Scope, needs: readonly Support[]): void {
  const support = scope.ws.read(SUPPORT);

  if (support === undefined) {
    scope.ws.note(`${SUPPORT} is missing: \`ddd-ts-kit init\` creates it (existing files are kept).`);

    return;
  }

  for (const need of needs) {
    if (!new RegExp(String.raw`^\s*${need}\(`, 'm').test(support)) {
      scope.ws.note(ADDED_BY_HAND[need]);
    }
  }
}

/** The spans a request leaves, as the spec expects them, laid out for the six spaces the element is written after. */
function spanTree(request: string, command: string): string {
  const element = `{ name: '${request}', kind: 'SERVER', children: [${command}] },`;

  return fitStatement(element, '      ').join('\n').trimStart();
}

interface Declared {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly isProtected: boolean;
}

type Endpoint = RenderContext & { readonly method: string; readonly path: string };

/** What the route of the use case declares, when it has one: an end-to-end spec drives the application through it. */
function endpointOf(scope: Scope, name: Name, file: string): Endpoint | undefined {
  const route = functionRoute(scope.ws.read(file) ?? '');

  if (route !== undefined) {
    scope.probe?.builtOn(scope.ws.placed(file));
  }

  const { method, path, status, isProtected } = route ?? controllerOf(scope, name) ?? {};

  if (method === undefined || path === undefined || status === undefined) {
    return undefined;
  }

  return {
    method,
    path,
    status,
    call: method.toLowerCase(),
    body: ['POST', 'PUT', 'PATCH'].includes(method) ? ', {}' : '',
    protected: isProtected === true,
    samplePath: path.replace(
      /:([A-Za-z_][A-Za-z0-9_]*)/g,
      (_match, parameter: string) => `${toName(parameter).kebab}-1`,
    ),
  };
}

function functionRoute(route: string): Declared | undefined {
  const [, method, path] = /method: '([A-Z]+)',\s*path: '([^']+)'/.exec(route) ?? [];
  const status = /responses: \{ (\d{3}):/.exec(route)?.[1];

  if (method === undefined || path === undefined || status === undefined) {
    return undefined;
  }

  return { method, path, status: Number(status), isProtected: !/security:\s*false/.test(route) };
}

/** The controller of the use case, wherever its folder is, read with the prefix and the guards of its groups. */
function controllerOf(scope: Scope, name: Name): Declared | undefined {
  const { ws, config, context, dir } = scope;

  const sources = {
    ws,
    config,
    name: context.kebab,
    directory: dir,
    modules: declaredModules(config, context.kebab),
    module: '',
  };

  const route = readControllers(sources, []).find(({ file }) => file.endsWith(`/${name.kebab}.controller.ts`));
  const [response] = route?.responses ?? [];

  if (route === undefined || response === undefined) {
    return undefined;
  }

  scope.probe?.builtOn(route.file);

  return {
    method: route.method,
    path: route.path,
    status: response.status,
    isProtected: !route.guards.includes('Public'),
  };
}
