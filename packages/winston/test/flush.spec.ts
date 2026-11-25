import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import winston from 'winston';
import { WinstonLogger, createWinstonLogger } from '../src';
import { MemorySink } from './support/memory-sink';
import { memoryTransport } from './support/memory-transport';

/** A transport whose stream refuses to end, as a file on a full disk does. */
class FailingAtTheEnd extends winston.transports.Stream {
  override _final(callback: (error?: Error | null) => void): void {
    callback(new Error('disk full'));
  }
}

/** A transport that says a moment later that it took a line, as one that waits for its file to open does. */
class Lagging extends winston.transports.Stream {
  override log(info: unknown, next: () => void): void {
    super.log?.(info, () => {
      setTimeout(next, 1);
    });
  }
}

/** A transport that never says it has written the line it was handed. */
class Silent extends winston.transports.Stream {
  override log(): void {
    return;
  }
}

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ddd-ts-kit-winston-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('WinstonLogger, the flush and the end', () => {
  it('has handed every line to a transport that lags once the flush resolves, and keeps writing', async () => {
    const sink = new MemorySink();
    const logger = createWinstonLogger({ transports: [new Lagging({ stream: sink.stream })] });
    const child = logger.child({ context: 'shipping' });

    for (let line = 0; line < 40; line += 1) {
      child.info(`parcel ${String(line)} handed over`);
    }

    expect(sink.records()).toHaveLength(1);

    await logger.flush();

    expect(sink.records()).toHaveLength(40);

    logger.info('server closed');
    await child.flush();

    expect(sink.records()).toHaveLength(41);
    expect(sink.records()[40]).toMatchObject({ message: 'server closed' });
  });

  it('waits ten seconds at most for a transport that never answers', async () => {
    vi.useFakeTimers();

    try {
      const logger = createWinstonLogger({ transports: [new Silent({ stream: new MemorySink().stream })] });
      let flushed = false;

      logger.info('order shipped');
      void logger.flush().then(() => (flushed = true));

      await vi.advanceTimersByTimeAsync(9_990);
      expect(flushed).toBe(false);
      await vi.advanceTimersByTimeAsync(10);
      expect(flushed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('has closed a file over every line once the end resolves, and drops what follows', async () => {
    const file = join(directory, 'app.log');
    const logger = createWinstonLogger({ transports: [new winston.transports.File({ filename: file })] });
    const child = logger.child({ context: 'shipping' });

    for (let line = 0; line < 500; line += 1) {
      child.info(`parcel ${String(line)} handed over`);
    }

    await logger.flush();
    child.info('parcel 500 handed over');
    await logger.end();
    child.error('logged after the end');
    logger.info('logged after the end');
    await child.flush();
    await child.end();

    const written = readFileSync(file, 'utf8').split('\n').filter(Boolean);

    expect(written).toHaveLength(501);
    expect(JSON.parse(written[500] ?? '{}')).toMatchObject({ message: 'parcel 500 handed over', context: 'shipping' });
  });

  it('resolves its end although a transport fails to finish', async () => {
    const instance = winston.createLogger({ transports: [new FailingAtTheEnd({ stream: new MemorySink().stream })] });

    instance.on('error', () => undefined);
    const logger = new WinstonLogger(instance);

    logger.info('order shipped');

    await expect(logger.end()).resolves.toBeUndefined();
  });

  it('resolves its flush on a logger without transport', async () => {
    const logger = new WinstonLogger(winston.createLogger({ silent: true }));

    await expect(logger.flush()).resolves.toBeUndefined();
  });

  it('says it writes no level once it was ended, and takes what is logged then without a throw', async () => {
    const sink = new MemorySink();
    const logger = createWinstonLogger({ transports: [memoryTransport(sink)] });
    const child = logger.child({ context: 'shipping' });

    logger.info('order shipped');
    await child.end();
    child.error('logged after the end', { error: new Error('too late') });

    expect([logger.isLevelEnabled('error'), child.isLevelEnabled('error')]).toEqual([false, false]);
    expect(sink.records()).toMatchObject([{ message: 'order shipped' }]);
    expect(sink.records()).toHaveLength(1);
  });
});
