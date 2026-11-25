import assert from 'node:assert/strict';
import { test } from 'node:test';
import { problemsOf } from './parity.mjs';

const CONTRACT = `
export interface ProcessStoreContractOptions {
  readonly name: string;
  createStore(): unknown;
  readonly unitOfWork?: () => unknown;
  readonly storeInTenant?: (scope: unknown) => unknown;
}

export function processStoreContract(runner: ContractRunner, options: ProcessStoreContractOptions): void {}
`;

const KNEX_IN_TENANT = `
export interface KnexProcessStoreOptions {
  readonly schema?: string;
  readonly tenant?: ExecutionScope;
}`;

const PRISMA = `
export interface PrismaProcessStoreOptions<Tx> {
  readonly delegate: (client: Tx) => unknown;
}`;

const PRISMA_IN_TENANT = `
export interface PrismaProcessStoreOptions<Tx> {
  readonly delegate: (client: Tx) => unknown;
  readonly tenant?: ExecutionScope;
}`;

/** A reason long enough to be read as one. */
const REASON = 'the member keeps the instances another way';

const RUN_IN_TENANT = `processStoreContract(runner, { name: 'a', createStore, storeInTenant: (tenant) => store(tenant) });`;
const RUN = `processStoreContract(runner, { name: 'b', createStore: () => store() });`;

test('an option of one member alone fails, and names the members that have it', () => {
  const problems = problemsOf(
    family(),
    source({ knex: KNEX_IN_TENANT, prisma: PRISMA, knexSpec: RUN_IN_TENANT, prismaSpec: RUN_IN_TENANT }),
  );

  assert.deepEqual(problems, [
    'ORM, process store: prisma has no option `tenant`, which knex offers. Add it, or say in families.mjs (apart) why prisma goes without.',
  ]);
});

test('a capability of the contract one member gives and another does not fails', () => {
  const problems = problemsOf(
    family(),
    source({ knex: KNEX_IN_TENANT, prisma: PRISMA_IN_TENANT, knexSpec: RUN_IN_TENANT, prismaSpec: RUN }),
  );

  assert.deepEqual(problems, [
    'ORM, process store: prisma runs processStoreContract without `storeInTenant`, which knex gives it. Give it, or say in families.mjs (capabilitiesApart) why not.',
  ]);
});

test('an asymmetry written with its reason passes, and fails once it is no longer true', () => {
  const apart = {
    apart: { tenant: { prisma: REASON } },
    capabilitiesApart: { storeInTenant: { prisma: REASON } },
  };
  const lacking = source({ knex: KNEX_IN_TENANT, prisma: PRISMA, knexSpec: RUN_IN_TENANT, prismaSpec: RUN });

  assert.deepEqual(problemsOf(family(apart), lacking), []);

  const caughtUp = source({
    knex: KNEX_IN_TENANT,
    prisma: PRISMA_IN_TENANT,
    knexSpec: RUN_IN_TENANT,
    prismaSpec: RUN_IN_TENANT,
  });

  assert.deepEqual(problemsOf(family(apart), caughtUp), [
    'ORM, process store: prisma now offers `tenant`: remove its exception from families.mjs (apart).',
    'ORM, process store: prisma now gives `storeInTenant` to processStoreContract: remove its exception from families.mjs (capabilitiesApart).',
  ]);
});

test('a reason that says too little is refused', () => {
  const vague = {
    apart: { tenant: { prisma: 'later' } },
    capabilitiesApart: { storeInTenant: { prisma: 'TODO: fix this one day' } },
  };
  const lacking = source({ knex: KNEX_IN_TENANT, prisma: PRISMA, knexSpec: RUN_IN_TENANT, prismaSpec: RUN });

  assert.deepEqual(problemsOf(family(vague), lacking), [
    'ORM, process store: the reason given for prisma says too little ("later"): say what the member does instead, or fill the gap.',
    'ORM, process store: the reason given for prisma says too little ("TODO: fix this one day"): say what the member does instead, or fill the gap.',
  ]);
});

test('a member whose specs never run the contract fails, unless it says why', () => {
  const silent = source({ knex: PRISMA.replace('Prisma', 'Knex'), prisma: PRISMA, knexSpec: '', prismaSpec: RUN });

  assert.deepEqual(problemsOf(family(), silent), [
    'ORM, process store: the specs of knex never run processStoreContract. Hold its adapter to it, or say in families.mjs (withoutContract) why not.',
  ]);

  assert.deepEqual(problemsOf(family({ withoutContract: { knex: REASON } }), silent), []);
});

test('a call with a type argument is a call of the contract', () => {
  const generic = RUN_IN_TENANT.replace('processStoreContract(', 'processStoreContract<Invoice>(');

  assert.deepEqual(
    problemsOf(family(), source({ knex: KNEX_IN_TENANT, prisma: PRISMA, knexSpec: generic, prismaSpec: generic }))
      .length,
    1,
  );
});

test('a port proven by some calls of a contract counts those calls alone', () => {
  const shared = `processStoreContract(runner, { name: 'knex, shared tables', createStore });`;
  const underSecurity = `processStoreContract(runner, { name: 'knex, row-level security', createStore });`;
  const port = { calls: /row-level security/ };
  const run = (prismaSpec) =>
    problemsOf(
      family(port),
      source({ knex: PRISMA.replace('Prisma', 'Knex'), prisma: PRISMA, knexSpec: underSecurity, prismaSpec }),
    );

  assert.deepEqual(run(underSecurity.replace('knex', 'prisma')), []);
  assert.deepEqual(run(shared), [
    'ORM, process store: the specs of prisma never run processStoreContract. Hold its adapter to it, or say in families.mjs (withoutContract) why not.',
  ]);
});

test('the options of the place are never compared, and an interface is read through extends, Pick and Omit', () => {
  const knex = `
export interface KnexStore extends Store {}
export interface TableOptions {
  readonly schema?: string;
  readonly table?: string;
  readonly tenant?: boolean;
}
export interface KnexProcessStoreOptions extends Omit<TableOptions, 'tenant'>, Pick<Scoped, 'tenant'> {
  readonly table?: string;
}`;
  const prisma = `
export interface PrismaProcessStoreOptions<Tx> {
  readonly delegate: (client: Tx) => unknown;
  readonly tenant?: ExecutionScope;
}`;

  assert.deepEqual(
    problemsOf(
      family({ place: ['schema', 'table', 'delegate'] }),
      source({ knex, prisma, knexSpec: RUN, prismaSpec: RUN }),
    ),
    [],
  );
});

test('an option two members name alike and give other words fails, and names the words of each', () => {
  const problems = problemsOf(
    family(),
    startingAlike(["'earliest' | 'latest'", "'earliest'"], ["'new' | 'beginning'", "'beginning'"]),
  );

  assert.deepEqual(problems, [
    "ORM, process store: `startFrom` takes 'earliest' | 'latest' on knex and takes 'beginning' | 'new' on prisma. Give it one meaning, or say in families.mjs (wordsApart) why a member differs.",
    "ORM, process store: `startFrom` defaults to 'earliest' on knex and defaults to 'beginning' on prisma. Give it one meaning, or say in families.mjs (defaultsApart) why a member differs.",
  ]);
});

test('an option with the same words and another default fails, whatever the order the words are written in', () => {
  const problems = problemsOf(
    family(),
    startingAlike(["'beginning' | 'end'", "'beginning'"], ["'end' | 'beginning'", "'end'"]),
  );

  assert.deepEqual(problems, [
    "ORM, process store: `startFrom` defaults to 'beginning' on knex and defaults to 'end' on prisma. Give it one meaning, or say in families.mjs (defaultsApart) why a member differs.",
  ]);
});

test('other words or another default written with a reason pass, and fail once the members agree', () => {
  const apart = { wordsApart: { startFrom: { prisma: REASON } }, defaultsApart: { startFrom: { prisma: REASON } } };
  const differing = startingAlike(["'beginning' | 'end'", "'beginning'"], ["'new' | 'beginning'", "'new'"]);
  const alike = startingAlike(["'beginning' | 'end'", "'beginning'"], ["'beginning' | 'end'", "'beginning'"]);

  assert.deepEqual(problemsOf(family(apart), differing), []);
  assert.deepEqual(problemsOf(family(), alike), []);

  assert.deepEqual(problemsOf(family(apart), alike), [
    "ORM, process store: `startFrom` takes 'beginning' | 'end' on prisma as on the others: remove its exception from families.mjs (wordsApart).",
    "ORM, process store: `startFrom` defaults to 'beginning' on prisma as on the others: remove its exception from families.mjs (defaultsApart).",
  ]);

  assert.deepEqual(problemsOf(family({ defaultsApart: { startFrom: { prisma: 'later' } } }), differing).slice(0, 1), [
    'ORM, process store: the reason given for prisma says too little ("later"): say what the member does instead, or fill the gap.',
  ]);
});

test('an option of the place, a type that is no list of words and a default that is no literal are not compared', () => {
  const knex = `
export interface KnexProcessStoreOptions extends Pick<Started, 'startFrom'> {
  readonly schema?: 'public' | 'tenant';
  readonly clock?: Clock;
}
export interface Started {
  readonly startFrom?: 'beginning' | 'end';
}
const schema = options.schema ?? 'public';
const clock = options.clock ?? new SystemClock();`;
  const prisma = `
export interface PrismaProcessStoreOptions {
  readonly schema?: 'main' | 'other';
  readonly clock?: OtherClock;
  readonly startFrom?: 'beginning' | 'end';
}
const schema = options.schema ?? 'main';
const clock = options.clock ?? systemClock();`;

  assert.deepEqual(problemsOf(family(), source({ knex, prisma, knexSpec: RUN, prismaSpec: RUN })), []);

  assert.equal(
    problemsOf(
      family(),
      source({ knex, prisma: prisma.replace("'beginning' | 'end'", "'new' | 'end'"), knexSpec: RUN, prismaSpec: RUN }),
    ).length,
    1,
  );
});

test('an options interface that is not in the package is reported', () => {
  const problems = problemsOf(family(), source({ knex: '', prisma: PRISMA, knexSpec: RUN, prismaSpec: RUN }));

  assert.equal(problems[0], 'ORM, process store: KnexProcessStoreOptions is not an interface of knex/src.');
});

/** Two ORM whose process stores take the options and run the contract as `knex` and `prisma` say. */
function source({ knex, prisma, knexSpec, prismaSpec }) {
  const sources = { knex: [{ file: 'a.ts', text: knex }], prisma: [{ file: 'b.ts', text: prisma }] };
  const tests = { knex: [{ file: 'a.spec.ts', text: knexSpec }], prisma: [{ file: 'b.spec.ts', text: prismaSpec }] };

  return {
    sources: (member) => sources[member],
    tests: (member) => tests[member],
    contracts: [{ file: 'c.ts', text: CONTRACT }],
  };
}

function family(port = {}) {
  return [
    {
      family: 'ORM',
      members: ['knex', 'prisma'],
      ports: [
        {
          port: 'process store',
          options: { knex: 'KnexProcessStoreOptions', prisma: 'PrismaProcessStoreOptions' },
          place: ['schema', 'delegate'],
          contract: 'processStoreContract',
          ...port,
        },
      ],
    },
  ];
}

/** Two ORM whose process stores take `startFrom`, each with its `[words, default]`. */
function startingAlike(knex, prisma) {
  return source({ knex: starting('Knex', knex), prisma: starting('Prisma', prisma), knexSpec: RUN, prismaSpec: RUN });
}

/** A process store that takes `startFrom` with these words and gives it this default. */
function starting(orm, [words, fallback]) {
  return `
export interface ${orm}ProcessStoreOptions {
  readonly startFrom?: ${words};
  readonly leaseMs?: number;
}
const startFrom = options.startFrom ?? ${fallback};
const leaseMs = options.leaseMs ?? 30_000;`;
}
