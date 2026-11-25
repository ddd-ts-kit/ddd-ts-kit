import fs from 'node:fs';
import { CliError } from '../cli-error';
import { runInit, type InitOptions } from '../init/run-init';
import type { Arguments } from './arguments';
import { defineCommand } from './command';
import { printReport } from './print-report';
import { VERSION } from '../version';

const STACK_FLAGS = [
  'http',
  'validation',
  'di',
  'tests',
  'orm',
  'database',
  'events',
  'ci',
  'authn',
  'authz',
  'broker',
  'cache',
  'rpc',
  'storage',
  'search',
  'audit',
  'privacy',
  'errors',
  'logger',
  'style',
  'assembly',
  'dependencies',
  'refusals',
  'routes',
  'representations',
  'forms',
  'schemas',
  'literals',
  'values',
  'tenancy',
  'queue',
] as const;

const OTHER_TEXT_FLAGS = [
  'docs-ui',
  'http-cache',
  'event-sourcing',
  'ci-extras',
  'allow-no-outbox',
  'import-alias',
  'import-extension',
  'package-manager',
  'value-objects',
  'agent-profile',
];

export const initCommand = defineCommand({
  name: 'init',
  usage: [
    'ddd-ts-kit init [--http express|fastify|hono|nest|none]',
    '                [--validation zod|class-validator|typebox|standard-schema|none]',
    '                [--di tsyringe|inversify|awilix|nest|manual] [--tests vitest|jest]',
    '                [--orm drizzle|knex|prisma|typeorm|custom|none] [--database postgres|mysql|sqlite|none]',
    '                [--events in-memory|outbox] [--docs-ui swagger|scalar|redoc|none]',
    '                [--ci github|gitlab|both|none] [--ci-extras <extra>,...|none]',
    '                [--authn jwt|keycloak|passport|none] [--authz rbac|abac|rebac|custom]',
    '                [--broker none|rabbitmq|kafka|nats|redis|custom] [--cache none|redis] [--http-cache none|varnish]',
    '                [--rpc none|orpc|trpc]',
    '                [--storage local|s3|none] [--search none|opensearch]',
    '                [--audit on|off] [--event-sourcing on|off] [--privacy on|off]',
    '                [--errors none|sentry] [--logger stdout|pino|winston] [--style declared|explicit] [--assembly barrel|discovery]',
    '                [--dependencies signature|listed] [--refusals named|factories|classes]',
    '                [--routes controllers|functions|nest] [--representations negotiated|json] [--forms on|off]',
    '                [--value-objects throwing|result] [--literals named|free] [--values classes|free] [--tenancy none|shared-table] [--queue database|redis|memory]',
    '                [--schemas shared|per-route]',
    '                [--package-manager npm|pnpm] [--allow-no-outbox "<reason>"] [--import-alias \'$<name>/\']',
    '                [--import-extension none|js] [--sdk] [--agent-profile regulated|none]',
    '                [--context <name>:<core|supporting|generic>]... [--preset identity]... [--dry-run] [--force]',
  ],
  options: {
    ...Object.fromEntries([...STACK_FLAGS, ...OTHER_TEXT_FLAGS].map((flag) => [flag, { type: 'string' as const }])),
    context: { type: 'string', multiple: true },
    preset: { type: 'string', multiple: true },
    'dry-run': { type: 'boolean' },
    force: { type: 'boolean' },
    sdk: { type: 'boolean' },
  },
  takesTheLock: { at: 'working-directory' },
  run(args, io) {
    if (args.positionals.length > 0) {
      throw new CliError(
        `Unexpected argument "${args.positionals[0] ?? ''}".`,
        'Pass the target directory with --cwd <dir>.',
      );
    }

    const root = args.workingDirectory;
    const dryRun = args.flag('dry-run');

    if (!dryRun) {
      fs.mkdirSync(root, { recursive: true });
    }

    return printReport(io, args, runInit(root, { ...initOptions(args, dryRun), rerun: rerunOf(args.asWritten) }));
  },
});

/** The command the owner runs outside a sandbox to write what this one could not: the same flags, written for real. */
function rerunOf(argv: readonly string[]): string {
  const flags = argv.filter((arg) => arg !== '--json' && arg !== '--dry-run').map(quoted);

  return ['npx', `ddd-ts-kit@${VERSION}`, 'init', ...flags].join(' ');
}

function quoted(arg: string): string {
  return /^[\w./:=@,+-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`;
}

function initOptions(args: Arguments, dryRun: boolean): InitOptions {
  return {
    ...stackOptions(args),
    contexts: args.many('context'),
    presets: args.many('preset'),
    dryRun,
    force: args.flag('force'),
  };
}

function stackOptions(args: Arguments) {
  const docsUi = args.text('docs-ui');
  const httpCache = args.text('http-cache');
  const eventSourcing = args.text('event-sourcing');
  const ciExtras = args.text('ci-extras');
  const allowNoOutbox = args.text('allow-no-outbox');
  const importAlias = args.text('import-alias');
  const importExtension = args.text('import-extension');
  const packageManager = args.text('package-manager');
  const valueObjects = args.text('value-objects');

  return {
    ...args.texts(STACK_FLAGS),
    ...(docsUi === undefined ? {} : { docsUi }),
    ...(httpCache === undefined ? {} : { httpCache }),
    ...(eventSourcing === undefined ? {} : { eventSourcing }),
    ...(ciExtras === undefined ? {} : { ciExtras }),
    ...(allowNoOutbox === undefined ? {} : { allowNoOutbox }),
    ...(importAlias === undefined ? {} : { importAlias }),
    ...(importExtension === undefined ? {} : { importExtension }),
    ...(packageManager === undefined ? {} : { packageManager }),
    ...(valueObjects === undefined ? {} : { valueObjects }),
    ...agentOptions(args),
  };
}

/** What `init` records about the agents of the project: the typed clients they get, the profile that holds them. */
function agentOptions(args: Arguments): Pick<InitOptions, 'sdk' | 'agentProfile'> {
  const agentProfile = args.text('agent-profile');

  return {
    ...(args.flag('sdk') ? { sdk: true } : {}),
    ...(agentProfile === undefined ? {} : { agentProfile }),
  };
}
