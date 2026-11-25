import type { ConfirmChannel } from 'amqplib';
import type { Publication } from '../codec/publication';
import { PublishNotConfirmedError } from '../errors/publish-not-confirmed-error';

type Confirmed = (error: unknown) => void;

/**
 * The confirmations the broker still owes for what was written on a confirm channel. Each one
 * is awaited for `timeoutMs` at most, and all of them fail at once when the channel goes: a
 * publication, a copy to a retry or dead queue and a replay never wait for ever.
 */
export class Confirmations {
  private readonly awaited = new Set<Confirmed>();

  constructor(private readonly timeoutMs: number) {}

  /**
   * Resolves once the broker confirmed what `send` wrote. Rejects with `PublishNotConfirmedError`
   * when the broker refused it, when the channel was closed, and when no answer came in time.
   */
  of(messageId: string, send: (confirmed: Confirmed) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const confirmed: Confirmed = (error) => {
        clearTimeout(late);
        this.awaited.delete(confirmed);

        if (error === null || error === undefined) {
          resolve();
        } else {
          reject(new PublishNotConfirmedError(messageId));
        }
      };

      this.awaited.add(confirmed);
      // A confirmation that never comes (a broker stalled under a full disk, a reply lost) fails what waits for it.
      const late = setTimeout(() => confirmed(new Error('not confirmed in time')), this.timeoutMs);

      try {
        send(confirmed);
      } catch {
        confirmed(new Error('channel closed'));
      }
    });
  }

  /** Sends a message to a queue through the default exchange and waits for its confirmation. */
  ofCopy(channel: ConfirmChannel, queue: string, { content, properties }: Publication): Promise<void> {
    return this.of(String(properties.messageId), (confirmed) => {
      channel.sendToQueue(queue, content, properties, confirmed);
    });
  }

  /** The channel is gone: what it had not confirmed never will be. */
  abandon(): void {
    for (const confirmed of [...this.awaited]) {
      confirmed(new Error('channel lost'));
    }
  }
}
