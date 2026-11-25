import type winston from 'winston';

type Buffering = Pick<winston.Logger, 'writableLength'>;

/** How long a flush waits before it looks at the buffers again. */
const LOOK_AGAIN_MS = 5;

/** The longest a flush waits: a transport that never answers does not hold a shutdown for ever. */
const LONGEST_WAIT_MS = 10_000;

/**
 * Resolves once the logger has handed each of its transports every line it was given, and ends
 * none of them: no line waits in the stream of the logger or of a transport. winston says when a
 * stream has finished, never when it has caught up: the buffers are looked at again until they
 * are empty, ten seconds at most.
 */
export async function handedOver(logger: winston.Logger): Promise<void> {
  for (let waited = 0; holdsLines(logger) && waited < LONGEST_WAIT_MS; waited += LOOK_AGAIN_MS) {
    await pause(LOOK_AGAIN_MS);
  }
}

/** Without a transport left to take them, the lines the logger holds wait for nothing. */
function holdsLines(logger: winston.Logger): boolean {
  const transports = logger.transports.filter((transport) => !transport.destroyed);

  return transports.length > 0 && (logger.readableLength > 0 || [logger, ...transports].some(isBehind));
}

function isBehind(stream: Buffering): boolean {
  return stream.writableLength > 0;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
