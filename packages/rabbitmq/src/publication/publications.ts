import type { ChannelModel, ConfirmChannel } from 'amqplib';
import type { IntegrationEvent } from '@ddd-ts-kit/kernel';
import { within } from '../connection/within';
import { encode } from '../codec/encode';
import { BrokerUnavailableError } from '../errors/broker-unavailable-error';
import { UnroutableEventError } from '../errors/unroutable-event-error';
import { ignore } from '../ignore';
import { Confirmations } from './confirmations';

export interface PublicationSettings {
  readonly exchange: string;
  readonly failOnUnroutable: boolean;
  /** A publication the broker has not confirmed by then is rejected, so that the relay retries it. */
  readonly publishTimeoutMs: number;
  /** Called when the channel dies while the connection lives. */
  readonly channelLost: () => void;
}

/**
 * Publishing with publisher confirms: a publication succeeds only once the broker has taken
 * responsibility for the message, which is what lets an outbox relay mark it published; one the
 * broker has not confirmed within `publishTimeoutMs` fails, as on NATS and Kafka.
 */
export class Publications {
  private readonly returned = new Set<string>();

  private readonly confirmations: Confirmations;

  private channel: ConfirmChannel | undefined;

  constructor(private readonly settings: PublicationSettings) {
    this.confirmations = new Confirmations(settings.publishTimeoutMs);
  }

  async attach(model: ChannelModel): Promise<void> {
    const channel = await model.createConfirmChannel();

    channel.on('error', ignore);

    channel.on('close', () => {
      if (this.channel === channel) {
        this.settings.channelLost();
      }
    });

    channel.on('return', (message) => {
      this.returned.add(String(message.properties.messageId));
    });

    await channel.assertExchange(this.settings.exchange, 'topic', { durable: true });
    this.channel = channel;
  }

  /** The channel is gone: what it had not confirmed never will be. */
  detach(): void {
    this.channel = undefined;
    this.returned.clear();
    this.confirmations.abandon();
  }

  /**
   * Resolves when every event is confirmed within `timeoutMs`; rejects with the first failure
   * otherwise.
   */
  async publish(events: readonly IntegrationEvent[], timeoutMs: number): Promise<void> {
    const channel = this.channel;

    if (channel === undefined) {
      throw new BrokerUnavailableError('RECONNECTING');
    }

    const outcomes = await Promise.allSettled(events.map((event) => this.send(channel, event, timeoutMs)));

    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        throw outcome.reason;
      }
    }
  }

  /**
   * Lets the confirmations in flight arrive, for `publishTimeoutMs` at most (one that did not come
   * in time never will), then closes the channel.
   */
  async close(): Promise<void> {
    const channel = this.channel;

    this.channel = undefined;
    await within(this.settings.publishTimeoutMs, channel?.waitForConfirms().catch(ignore));
    await within(this.settings.publishTimeoutMs, channel?.close().catch(ignore));
  }

  private async send(channel: ConfirmChannel, event: IntegrationEvent, timeoutMs: number): Promise<void> {
    const { content, properties } = encode(event);
    const options = { ...properties, mandatory: this.settings.failOnUnroutable };

    await this.confirmations.of(
      event.id,
      (confirmed) => {
        channel.publish(this.settings.exchange, event.type, content, options, confirmed);
      },
      timeoutMs,
    );

    // The broker sends the return of an unroutable message before its confirmation.
    if (this.returned.delete(event.id)) {
      throw new UnroutableEventError(event.id, event.type);
    }
  }
}
