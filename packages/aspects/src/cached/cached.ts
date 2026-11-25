import { cacheKey, tenantCacheKey, type Cache, type CacheKey, type Metrics } from '@ddd-ts-kit/kernel';
import type { AdviceFactory } from '../aspect/advice-factory';
import type { AspectKind } from '../aspect/aspect-kind';
import type { Aspect } from '../aspect/aspect';
import { defineAspect } from '../aspect/define-aspect';
import type { JoinPoint } from '../aspect/join-point';
import { AspectNotAllowedError } from '../errors/aspect-not-allowed-error';
import { safely } from '../observability/safely';
import { cacheOr } from '../runtime/cache-or';
import { currentRuntime } from '../runtime/installed-runtime';
import { isElevatedWork } from '../runtime/is-elevated-work';
import { tenantScopeOfWork } from '../runtime/tenant-scope-of-work';
import { UNNAMED_CLASS } from '../weaving/site-of';

export interface CachedOptions {
  /**
   * The cache key of a call, or `undefined` for a call that is not cached. The only place
   * arguments are read: build the key from identifiers, never from personal data.
   */
  readonly key: (method: string, args: readonly unknown[]) => string | undefined;
  readonly ttlMs: number;
  /** Defaults to the cache of the aspect runtime. */
  readonly cache?: Cache;
  /**
   * Counts what the cache failed as `cache_errors_total`, labelled `operation` (`get`, `set`),
   * `context`, `class` and `method`. Defaults to the metrics of the aspect runtime; without
   * either, a failure is a miss nobody counts.
   */
  readonly metrics?: Metrics;
  /**
   * One entry for every tenant, for a read whose answer does not depend on any tenant. By default
   * the entry is confined to the tenant of the work, which needs `scope` in the aspect runtime:
   * without it, and without `shared: true`, the call throws. A shared read cannot see an
   * elevation (`acrossTenants`) unless the runtime has the scope.
   */
  readonly shared?: boolean;
  /** Kinds to wrap although they are refused by default: `repository`, `use-case`. */
  readonly allowKinds?: readonly AspectKind[];
}

interface Cached {
  readonly value: unknown;
}

const REFUSED_KINDS: readonly AspectKind[] = ['repository', 'use-case'];

/**
 * Answers a read from the cache when it was made recently. For read methods of gateways and
 * external adapters: select them with `when(forMethods('find*'), cached(...))`. Refuses to
 * wrap a repository or a use case unless `allowKinds` says so: an aggregate served from a
 * cache hides that it is stale. Needs the execution scope of the aspect runtime (`scope` of
 * `installAspectRuntime`), or `shared: true`, and throws at the call without either. Work that
 * names a tenant has its own entries through that scope, unless `shared` says otherwise; work
 * that names none keeps the key as written; work under an elevation (`acrossTenants`) neither reads nor writes the
 * cache, since its answer may reach beyond one tenant. An entry belongs to one port of one context:
 * its key carries the context, the port the instance is bound to (its class name without one), the
 * method and the key of the call, and an instance that has neither a port nor a class name is refused.
 * Concurrent identical calls of one tenant share one underlying call; failures are not cached; a
 * cache that fails is treated as a miss, and counted.
 */
export function cached(options: CachedOptions): Aspect {
  return defineAspect(cachedAdvice(options));
}

export function cachedAdvice(options: CachedOptions): AdviceFactory {
  return (joinPoint) => {
    assertAllowed(joinPoint, options);
    assertNamed(joinPoint);

    const inFlight = new Map<string, Promise<unknown>>();

    return async ({ args, proceed }) => {
      const id = options.key(joinPoint.method, args);

      if (id === undefined || isElevatedWork()) {
        return proceed();
      }

      const entry = entryOf(joinPoint, id, options);
      const { name } = entry.key;
      const hit = await read(entry);

      if (hit !== undefined) {
        return hit.value;
      }

      const pending = inFlight.get(name) ?? loading(entry, proceed).finally(() => inFlight.delete(name));

      inFlight.set(name, pending);

      return pending;
    };
  };
}

function assertAllowed(joinPoint: JoinPoint, options: CachedOptions): void {
  const { kind } = joinPoint;

  if (kind === undefined || !REFUSED_KINDS.includes(kind) || options.allowKinds?.includes(kind) === true) {
    return;
  }

  throw new AspectNotAllowedError(
    `cached refuses to wrap ${joinPoint.className}.${joinPoint.method}, bound as ${kind}: what it would serve may be stale. Select gateways and external adapters with when(forKinds(...)), or pass allowKinds: ['${kind}'] to take the decision.`,
  );
}

/** Two objects nothing names would read each other's entries: the key has nothing else to tell them apart. */
function assertNamed({ token, className, method }: JoinPoint): void {
  if (token !== undefined || className !== UNNAMED_CLASS) {
    return;
  }

  throw new AspectNotAllowedError(
    `cached refuses to wrap ${method} of an object that has neither a port nor a class name: its entries would be those of every other such object. Bind it under a port and wrap it with aspects(...), or name it as the second argument: { token } or { className }.`,
  );
}

type CacheOperation = 'get' | 'set';

interface Entry {
  readonly cache: Cache;
  readonly key: CacheKey<Cached>;
  readonly ttlMs: number;
  /** Told each operation the cache failed. */
  readonly failed: (operation: CacheOperation) => void;
}

function entryOf(joinPoint: JoinPoint, id: string, options: CachedOptions): Entry {
  return {
    cache: cacheOr(options.cache),
    key: keyOf(joinPoint, id, options),
    ttlMs: options.ttlMs,
    failed: counting(joinPoint, options),
  };
}

function keyOf(joinPoint: JoinPoint, id: string, { shared }: CachedOptions): CacheKey<Cached> {
  const { context, token, className, method } = joinPoint;
  const segments = ['aspect', ...(context === undefined ? [] : [context]), token ?? className, method, id];
  const scope = shared === true ? undefined : tenantScopeOfWork();

  return scope === undefined ? cacheKey<Cached>(...segments) : tenantCacheKey<Cached>(scope, ...segments);
}

/** A cache that stopped working costs misses: the counter is what tells it from a cache that works. */
function counting(joinPoint: JoinPoint, options: CachedOptions): Entry['failed'] {
  const metrics = options.metrics ?? currentRuntime().metrics;
  const labels = { context: joinPoint.context, class: joinPoint.className, method: joinPoint.method };

  return (operation) => {
    safely(() => metrics?.counter('cache_errors_total').increment({ ...labels, operation }));
  };
}

async function read({ cache, key, failed }: Entry): Promise<Cached | undefined> {
  try {
    return await cache.get(key);
  } catch {
    failed('get');

    return undefined;
  }
}

async function loading({ cache, key, ttlMs, failed }: Entry, proceed: () => Promise<unknown>): Promise<unknown> {
  const value = await proceed();

  try {
    await cache.set(key, { value }, { ttlMs });
  } catch {
    failed('set');
  }

  return value;
}
