import type { PurityTable } from './purity-table';

const RANDOM_OF_CRYPTO = ['randomUUID', 'getRandomValues', 'randomBytes', 'randomInt'];

/** One table per purity/* rule, under its id of the architecture reference. */
export const PURITY_TABLES = {
  'purity/no-system-clock': {
    id: 'purity/no-system-clock',
    description:
      'No new Date() without argument, Date.now(), Date() or performance.now() in domain/ or application/: time comes from the Clock port.',
    fix: 'Receive the instant as a parameter in the domain, and take it from the Clock port (`this.clock.now()`) in a handler, so that a test fixes time with FixedClock.',
    members: { Date: ['now'], performance: ['now', 'timeOrigin'] },
    calls: ['Date'],
    constructions: [],
    bareConstructions: ['Date'],
    modules: [],
    namedImports: {},
  },
  'purity/no-ambient-randomness': {
    id: 'purity/no-ambient-randomness',
    description:
      'No Math.random, crypto.randomUUID or id library in domain/ or application/: identifiers come from the IdGenerator port.',
    fix: 'Receive the identifier as a parameter in the domain, and take it from the IdGenerator port (`this.ids.next()`) in a handler, so that a test gets predictable identifiers.',
    members: { Math: ['random'], crypto: RANDOM_OF_CRYPTO },
    calls: ['randomUUID'],
    constructions: [],
    bareConstructions: [],
    modules: [
      'uuid',
      'nanoid',
      'ulid',
      'ulidx',
      'cuid',
      '@paralleldrive/cuid2',
      'ksuid',
      'shortid',
      'uuidv7',
      'hyperid',
      'bson',
    ],
    namedImports: { crypto: [...RANDOM_OF_CRYPTO, 'webcrypto'] },
  },
  'purity/no-environment': {
    id: 'purity/no-environment',
    description: 'No process.env, console, file system or network access in domain/ or application/.',
    fix: 'Declare what is needed as a port in application/ports (an abstract class: a configuration, a logger, a gateway), implement it in infrastructure/ and bind it in the module file.',
    members: { process: ['env', 'argv', 'cwd', 'exit', 'stdout', 'stderr', 'stdin'], console: [] },
    calls: ['fetch'],
    constructions: ['XMLHttpRequest', 'WebSocket', 'EventSource'],
    bareConstructions: [],
    modules: [
      'fs',
      'http',
      'https',
      'http2',
      'net',
      'dgram',
      'dns',
      'tls',
      'child_process',
      'worker_threads',
      'os',
      'readline',
      'axios',
      'node-fetch',
      'undici',
      'got',
      'dotenv',
    ],
    namedImports: {},
  },
} as const satisfies Record<string, PurityTable>;
