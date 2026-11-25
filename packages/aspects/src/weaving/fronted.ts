import type { Method } from './method';

/**
 * A front for the instance: an object of the same class that answers the wrappers in place of
 * the methods and everything else from the instance, which is left as it was. A method runs
 * with the front as `this`: a method it calls through `this` meets the same wrappers, and a
 * field it reads or assigns is the one of the instance. A method defined on the front
 * afterwards, as a tracer that shadows in place does, is a method of the front too.
 */
export function fronted<T extends object>(instance: T, wrappers: ReadonlyMap<string, Method>): T {
  const methods = new Map<string, unknown>(wrappers);

  return new Proxy(instance, {
    get(target, property, receiver: unknown) {
      const method = typeof property === 'string' ? methods.get(property) : undefined;

      return method ?? Reflect.get(target, property, receiver);
    },

    set(target, property, value: unknown) {
      return Reflect.set(target, property, value);
    },

    defineProperty(target, property, descriptor) {
      if (typeof property !== 'string' || typeof descriptor.value !== 'function' || !Object.isExtensible(target)) {
        return Reflect.defineProperty(target, property, descriptor);
      }

      methods.set(property, descriptor.value);

      return true;
    },
  });
}
