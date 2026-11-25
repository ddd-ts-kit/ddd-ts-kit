import { CliError } from '../../../cli-error';
import type { ConsumedEventFact } from '../../../describe/context-description';
import type { ContextSources } from '../../../describe/context-sources';
import { readConsumedEvents } from '../../../describe/read-consumed-events';
import { readEventDefinitions } from '../../../describe/read-event-definitions';
import { readRoutes } from '../../../describe/read-routes';
import { toName, type Name } from '../../../naming';
import type { RenderContext } from '../../../templating';
import { foundPrerequisite } from '../../found-prerequisite';
import { MissingPrerequisite } from '../../missing-prerequisite';
import type { Scope } from '../../scope';
import type { SendingJobs } from './jobs-sending';
import { startingJobs } from './starting-jobs';
import { declaredModules, wiringTextOf } from '../../../model-modules';

/** What an end-to-end spec publishes to start a use case no route reaches, and where a client reads what followed. */
export interface Reaction {
  readonly upstream: RenderContext;
  readonly e2e: RenderContext;
  /** The file of the handler that receives the event. */
  readonly handler: string;
}

/** What an end-to-end spec runs to start a use case no route reaches and no handler does, or the one `--job` names: the jobs that send its command. */
export interface JobStart {
  readonly jobs: SendingJobs;
  readonly e2e: RenderContext;
}

/**
 * The integration event whose handler sends the command of the use case: the one named with
 * `--event`, or the only one a handler of the context sends that command for. Failing that, or
 * when `--job` names one, the jobs of the context that send it, scheduled or background.
 */
export function reactionOf(scope: Scope, name: Name, routeFile: string): Reaction | JobStart {
  const sources = sourcesOf(scope);
  const consumed = readConsumedEvents(sources);
  const useCase = { scope, name, consumed };
  const asked = scope.flags.event;
  const event = eventOf(useCase, asked);
  const jobs = event === undefined ? startingJobs(scope, name) : { scheduled: [], background: [] };

  if (event === undefined && jobs.scheduled.length + jobs.background.length === 0) {
    throw noTrigger(useCase, routeFile);
  }

  if (event !== undefined) {
    scope.flags.builtOn?.(event.file);
  }

  const reads = readRoutes(sources, [])
    .filter((route) => route.method === 'GET')
    .map((route) => `GET ${route.path}`);

  if (event === undefined) {
    return { jobs, e2e: { reads: reads.join(', '), readable: reads.length > 0 } };
  }

  return {
    upstream: upstreamVars(scope, event),
    e2e: { reads: reads.join(', '), readable: reads.length > 0, handlers: handlersOf(consumed, event.type) },
    handler: event.file,
  };
}

/** A use case, in the context whose integration event handlers may send its command. */
interface UseCaseOf {
  readonly scope: Scope;
  readonly name: Name;
  /** The integration events the context handles, one per handler. */
  readonly consumed: readonly ConsumedEventFact[];
}

/** No event when `--job` names what starts the use case: the spec is the one of that job. */
function eventOf(useCase: UseCaseOf, asked: string | undefined): ConsumedEventFact | undefined {
  if (useCase.scope.flags.job !== undefined) {
    return undefined;
  }

  return asked === undefined ? sentFor(useCase) : handledOf(useCase, asked);
}

/** The sources of a context of the project: the one of the command, unless another is named. */
function sourcesOf(scope: Scope, context = scope.context.kebab): ContextSources {
  const { ws, config } = scope;
  const directory = context === scope.context.kebab ? scope.dir : `${config.contextsDir}/${context}`;
  const modules = declaredModules(config, context);

  return { ws, config, name: context, directory, modules, module: wiringTextOf(ws, { directory, modules }, context) };
}

/** The event of the handlers that send the command of the use case, when they all handle the same one. */
function sentFor(useCase: UseCaseOf): ConsumedEventFact | undefined {
  const { scope, name, consumed } = useCase;
  const command = new RegExp(String.raw`\b${name.pascal}Command\b`);
  const senders = consumed.filter((fact) => command.test(scope.ws.read(fact.file) ?? ''));
  const types = [...new Set(senders.map((fact) => fact.type))];
  const [sender] = senders;

  if (sender === undefined) {
    return undefined;
  }

  if (types.length > 1) {
    throw new CliError(
      `Several integration event handlers of "${scope.context.kebab}" send ${name.pascal}Command: ${senders.map((fact) => `${fact.handler} (${fact.type})`).join(', ')}.`,
      `Name the event the spec publishes: \`ddd-ts-kit generate e2e ${scope.context.kebab} ${name.pascal} --event <eventType>\`, one of ${types.join(', ')}.`,
    );
  }

  return sender;
}

function noTrigger({ scope, name, consumed }: UseCaseOf, routeFile: string): MissingPrerequisite {
  const handled = consumed.length === 0 ? '' : ` (handled here: ${typesOf(consumed).join(', ')})`;

  return new MissingPrerequisite(
    `The use case ${name.pascal} has no route in "${scope.context.kebab}" (${routeFile}), no integration event handler of it sends ${name.pascal}Command, and no job of it does (application/scheduling/*.job.ts, application/background/*.background-job.ts).`,
    `An end-to-end spec drives the application through HTTP, through the integration event that starts the use case, or through the job that runs it: create the route first with \`ddd-ts-kit generate route ${scope.context.kebab} ${name.pascal} --method <M> --path <path>\`, create the job with \`ddd-ts-kit generate job ${scope.context.kebab} <JobName> --every <duration> --command ${name.pascal}\` (or \`generate background-job ${scope.context.kebab} <Name> --command ${name.pascal}\` for one a use case enqueues), or name the event its handler receives with --event <context>.<aggregate>.<fact>${handled}.`,
  );
}

/** The event named with `--event`: a handler of the context receives it, and the command it starts exists. */
function handledOf({ scope, name, consumed }: UseCaseOf, asked: string): ConsumedEventFact {
  const command = `${scope.dir}/application/commands/${name.kebab}/${name.kebab}.command.ts`;

  if (!foundPrerequisite(scope, command)) {
    throw new MissingPrerequisite(
      `The use case ${name.pascal} has no command in "${scope.context.kebab}" (${command}).`,
      `An integration event handler starts a command of its context: create it first with \`ddd-ts-kit generate command ${scope.context.kebab} ${name.pascal} --permission <aggregate>.<action>\`.`,
    );
  }

  const handled = consumed.find((fact) => fact.type === asked);

  if (handled !== undefined) {
    return handled;
  }

  throw new MissingPrerequisite(
    `No integration event handler of "${scope.context.kebab}" receives ${asked}.`,
    [
      ...(consumed.length === 0 ? [] : [`It handles ${typesOf(consumed).join(', ')}: pass one of them with --event.`]),
      ...whereItIsReceived(scope, asked),
    ].join(' '),
  );
}

/**
 * What to do about an event the context does not receive: the contexts that do, whose use case the
 * spec may be about, then the handler to create here, unless the context publishes the event itself.
 */
function whereItIsReceived(scope: Scope, asked: string): string[] {
  const here = scope.context.kebab;
  const [publisher = '<upstreamContext>'] = asked.split('.');

  const receivers = Object.keys(scope.config.contexts).filter(
    (context) => context !== here && readConsumedEvents(sourcesOf(scope, context)).some(({ type }) => type === asked),
  );

  const elsewhere =
    receivers.length === 0
      ? `No context of the project receives ${asked} yet.`
      : `${asked} is received by ${receivers.join(', ')}: the spec of a use case it starts there is \`ddd-ts-kit generate e2e ${receivers[0] ?? ''} <UseCaseName> --event ${asked}\`.`;

  return publisher === here
    ? [`${here} publishes ${asked}: the use case it starts belongs to the context that receives it.`, elsewhere]
    : [
        elsewhere,
        `For ${here} to receive it, create the handler first with \`ddd-ts-kit generate integration-handler ${here} ${publisher} ${asked}\`.`,
      ];
}

function typesOf(consumed: readonly ConsumedEventFact[]): string[] {
  return [...new Set(consumed.map((fact) => fact.type))];
}

function handlersOf(consumed: readonly ConsumedEventFact[], type: string): string {
  return consumed
    .filter((fact) => fact.type === type)
    .map((fact) => fact.handler)
    .join(', ');
}

/** The declaration the handler is given, when its upstream has one here: the spec builds the event from it. */
function upstreamVars(scope: Scope, event: ConsumedEventFact): RenderContext {
  const declared = readEventDefinitions(scope.ws, `${scope.config.contextsDir}/${event.from}`).find(
    (definition) => definition.type === event.type && definition.version === event.version,
  );

  const [, aggregate = ''] = event.type.split('.');

  return {
    ...toName(event.from),
    eventName: event.type,
    known: declared !== undefined,
    definition: declared?.name ?? '',
    version: event.version ?? 1,
    // The one field a generated declaration starts with.
    payloadKey: `${toName(aggregate).camel}Id`,
    payloadSample: `${aggregate}-1`,
  };
}
