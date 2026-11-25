/**
 * The same chunks; leaving them closes the list they are written from, read or not. A generator
 * that never ran closes nothing it would have read: a list given up before its first chunk (an
 * RPC call that refuses it, a client already gone) would keep its cursor open.
 */
export function closingWith(chunks: AsyncIterable<string>, list: AsyncIterable<unknown>): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]: () => {
      const iterator = chunks[Symbol.asyncIterator]();

      return {
        next: () => iterator.next(),
        return: async (value?: unknown) => {
          const left = (await iterator.return?.(value)) ?? { done: true, value: undefined };

          await list[Symbol.asyncIterator]().return?.();

          return left;
        },
      };
    },
  };
}
