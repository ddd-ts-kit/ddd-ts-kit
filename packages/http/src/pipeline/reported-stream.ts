/**
 * The same chunks; a failure while they are read, once the status is sent, is told to `report`
 * before it cuts the response short, the only thing it can still do to it.
 */
export function reportedStream(chunks: AsyncIterable<string>, report: (error: unknown) => void): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]: () => {
      const iterator = chunks[Symbol.asyncIterator]();

      return {
        next: async () => {
          try {
            return await iterator.next();
          } catch (error) {
            report(error);

            throw error;
          }
        },
        return: async (value?: unknown) => (await iterator.return?.(value)) ?? { done: true, value: undefined },
      };
    },
  };
}
