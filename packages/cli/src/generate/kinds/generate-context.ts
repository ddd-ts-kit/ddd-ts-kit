import {
  addContextToConfigText,
  CLASSIFICATIONS,
  CONFIG_FILE,
  isOneOf,
  type Config,
  type Upstream,
} from '../../config';
import { addUpstreamsToConfigText } from '../../config/add-upstreams-to-config-text';
import { refreshContextDoc } from '../../docs/refresh-context-doc';
import { CliError } from '../../cli-error';
import { MissingPrerequisite } from '../missing-prerequisite';
import { parseContextName, type Name } from '../../naming';
import { TECHNICAL_WORDS } from '../../check/language/technical-words';
import { CONTEXT_FOLDERS } from '../../model-modules/module-layers';
import { SHARED_KERNEL } from '../shared-kernel-scope';
import { PRISMA_MAIN_SCHEMA, prismaSchemaOf } from '../../prisma-schema';
import type { Workspace } from '../../workspace';
import type { ContextRequest } from './context-request';
import { declareContextEntries } from './declare-context-entries';
import { writeContextFiles } from './write-context-files';
import { ownEntry } from '../../config/values/own-entry';

/** Shared by `generate context` and `init`, so both create exactly the same context. */
export function generateContext(ws: Workspace, config: Config, request: ContextRequest): Config {
  const context = parseContextName(request.name);

  refuseObjectName(request.name, context);
  refuseReservedName(context);
  refuseUnaddressableName(context);

  const classification = knownClassification(context, request.classification);

  assertUpstreamsExist(config, context, request);

  const existing = ownEntry(config.contexts, context.kebab);

  const entry =
    existing === undefined
      ? newEntry(classification, request.upstreams)
      : withUpstreams(config, { here: context.kebab, existing, asked: request.upstreams });

  const next: Config = { ...config, contexts: { ...config.contexts, [context.kebab]: entry } };

  if (existing === undefined) {
    declareInConfig(ws, context, entry);
  } else if (entry !== existing) {
    declareUpstreams(ws, context, entry.upstreams.slice(existing.upstreams.length));
  }

  writeContextFiles(ws, { config: next, context, request });
  declareContextEntries(ws, next);

  // An upstream gains a downstream line in its own CONTEXT.md.
  for (const upstream of entry.upstreams) {
    refreshContextDoc(ws, next, upstream.context);
  }

  refreshContextDoc(ws, next, context.kebab);

  return next;
}

/** The names every object of JavaScript answers to, whatever it holds. */
const OBJECT_NAMES = ['constructor', 'prototype', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];

/**
 * A context is a key of the config, of the context map and of the objects the generated code
 * builds from them, where `constructor` or `toString` names what every object has: a lookup
 * would answer the prototype of the object instead of the context.
 */
function refuseObjectName(input: string, context: Name): void {
  const taken = OBJECT_NAMES.find((name) => [input, context.kebab, context.camel].includes(name));

  if (taken === undefined) {
    return;
  }

  throw new CliError(
    `"${input}" cannot name a bounded context: ${taken} is a name every JavaScript object has, and a context is a key of the config and of the objects built from it.`,
    'Name the context after the business capability it serves, for example billing or order-fulfilment.',
  );
}

/**
 * The models of a context on Prisma live in `prisma/schema/<context>.prisma`, beside the main file
 * `prisma/schema/schema.prisma`: a context named `schema` would write its models into the main
 * file, and the guard reads that file as no context's. Refused on every ORM: `init --force`
 * changes the ORM of a project, and the word names the storage, not a capability of the business.
 */
function refuseReservedName(context: Name): void {
  if (prismaSchemaOf(context.kebab) !== PRISMA_MAIN_SCHEMA) {
    return;
  }

  throw new CliError(
    `"${context.kebab}" cannot name a bounded context: on Prisma the models of a context live in ${prismaSchemaOf('<context>')}, and ${PRISMA_MAIN_SCHEMA} is the main file of the schema (the generator, the datasource, the tables of the platform), shared by every context.`,
    'Name the context after the business capability it serves, for example billing or order-fulfilment. The name is refused on every ORM, since `init --force` can move a project to Prisma.',
  );
}

/** Whole names that group code instead of naming a capability; `core-banking` or `platform-fees` are not on it, only the name alone. */
const GROUPING_NAMES: readonly string[] = [
  ...TECHNICAL_WORDS,
  'platform',
  'all',
  'shared',
  'common',
  'core',
  'misc',
  'general',
  'other',
  'main',
  'default',
  'lib',
  'stuff',
];

/**
 * A context is addressed by its name as the first argument of every other kind, and its folder sits
 * beside the layers of the context tree: the name of the shared kernel, of a layer or a role folder,
 * or of a grouping of code alone (`utils`, `platform`, `shared`) names a context no kind can write into.
 * Only the whole name is judged: `core-banking` is a capability.
 */
function refuseUnaddressableName(context: Name): void {
  if (context.kebab === SHARED_KERNEL) {
    throw new CliError(
      `"${SHARED_KERNEL}" cannot name a bounded context: it names the shared kernel, and every kind reads it as the kernel, never as a context.`,
      'Name the context after the business capability it serves, for example billing or order-fulfilment; what several contexts use belongs to the shared kernel.',
    );
  }

  if (CONTEXT_FOLDERS.includes(context.kebab)) {
    throw new CliError(
      `"${context.kebab}" cannot name a bounded context: it is the name of a layer or of a folder of the root of a context.`,
      'Name the context after the business capability it serves, for example billing or order-fulfilment.',
    );
  }

  if (GROUPING_NAMES.includes(context.kebab)) {
    throw new CliError(
      `"${context.kebab}" cannot name a bounded context: "${context.kebab}" names a grouping of code, not a business capability.`,
      'Name the context after the business capability it serves, for example billing or order-fulfilment.',
    );
  }
}

function knownClassification(context: Name, classification: string | undefined): string {
  if (isOneOf(CLASSIFICATIONS, classification)) {
    return classification;
  }

  throw new CliError(
    classification === undefined
      ? `The context "${context.kebab}" needs a classification.`
      : `Unknown classification "${classification}".`,
    `Pass --classification with one of: ${CLASSIFICATIONS.join(', ')} (core: what differentiates the business; supporting: needed, not differentiating; generic: buy or keep trivial).`,
  );
}

function assertUpstreamsExist(config: Config, context: Name, { upstreams, builtOn }: ContextRequest): void {
  for (const upstream of upstreams) {
    if (upstream.context === context.kebab) {
      throw new CliError(
        `The context "${context.kebab}" cannot be its own upstream.`,
        'Remove the --upstream option naming the context itself.',
      );
    }

    if (ownEntry(config.contexts, upstream.context) === undefined) {
      throw new MissingPrerequisite(
        `The upstream context "${upstream.context}" is not declared.`,
        `Create it first with \`ddd-ts-kit generate context ${upstream.context} --classification <core|supporting|generic>\`.`,
      );
    }

    builtOn?.(`${config.contextsDir}/${upstream.context}/CONTEXT.md`);
  }
}

type ContextEntry = Config['contexts'][string];

function newEntry(classification: string, upstreams: readonly Upstream[]): ContextEntry {
  return { classification, upstreams, extraDirectories: [], modules: [], deployable: false, owners: [] };
}

/** What `generate context` asks of a context that exists: the upstreams it names, beside the entry it has. */
interface UpstreamsAsked {
  readonly here: string;
  readonly existing: ContextEntry;
  readonly asked: readonly Upstream[];
}

/**
 * A context that exists keeps what it declares, and gains each `--upstream` it does not declare
 * yet: the relationship found after the context was created is declared by the same command. An
 * upstream that already reaches the context through its own upstreams would close a cycle.
 */
function withUpstreams(config: Config, { here, existing, asked }: UpstreamsAsked): ContextEntry {
  asked.forEach((upstream) => {
    refuseOtherRelationship(here, existing, upstream);
  });

  const added = asked.filter(
    (upstream, index) =>
      !existing.upstreams.some((known) => known.context === upstream.context) &&
      asked.findIndex((first) => first.context === upstream.context) === index,
  );

  if (added.length === 0) {
    return existing;
  }

  for (const upstream of added) {
    refuseCycle(config, here, upstream.context);
  }

  return { ...existing, upstreams: [...existing.upstreams, ...added] };
}

/** The pattern of a pair is chosen once, in the config: an `--upstream` that names another one for a declared upstream would be lost. */
function refuseOtherRelationship(here: string, existing: ContextEntry, upstream: Upstream): void {
  const known = existing.upstreams.find((candidate) => candidate.context === upstream.context);

  if (known === undefined || known.relationship === upstream.relationship) {
    return;
  }

  throw new CliError(
    `"${here}" already declares "${upstream.context}" as an upstream, as ${known.relationship}, not ${upstream.relationship}.`,
    `Change the pattern of the pair where it is declared: { "context": "${upstream.context}", "relationship": "${upstream.relationship}" } in contexts.${here}.upstreams of ${CONFIG_FILE}, then run \`ddd-ts-kit docs\`.`,
  );
}

function refuseCycle(config: Config, here: string, upstream: string): void {
  const path = pathBetween(config, { from: upstream, to: here, seen: [] });

  if (path === undefined) {
    return;
  }

  throw new CliError(
    `"${upstream}" already depends on "${here}" (${[...path, here].join(' -> ')}): declaring it as an upstream of "${here}" closes a cycle (context/no-cycle).`,
    `Keep the dependency in one direction: let "${here}" react to an integration event of "${upstream}" without declaring it, or declare "${here}" upstream of "${upstream}" only.`,
  );
}

/** A walk along the upstreams: where it is, where it goes, and the contexts it went through. */
interface Walk {
  readonly from: string;
  readonly to: string;
  readonly seen: readonly string[];
}

/** The chain of upstreams from `from` to `to`, `from` first, or undefined when `to` is not one of them. */
function pathBetween(config: Config, { from, to, seen }: Walk): readonly string[] | undefined {
  if (from === to) {
    return seen;
  }

  if (seen.includes(from)) {
    return undefined;
  }

  for (const upstream of ownEntry(config.contexts, from)?.upstreams ?? []) {
    const found = pathBetween(config, { from: upstream.context, to, seen: [...seen, from] });

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function declareUpstreams(ws: Workspace, context: Name, added: readonly Upstream[]): void {
  const text = ws.read(CONFIG_FILE);

  if (text !== undefined) {
    ws.update(CONFIG_FILE, addUpstreamsToConfigText(text, context.kebab, added));
  }
}

function declareInConfig(ws: Workspace, context: Name, entry: ContextEntry): void {
  const text = ws.read(CONFIG_FILE);

  if (text !== undefined) {
    ws.update(CONFIG_FILE, addContextToConfigText(text, context.kebab, entry));
  }
}
