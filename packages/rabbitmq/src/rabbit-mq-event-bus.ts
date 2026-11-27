import { inspect } from 'node:util';
import { connect } from 'amqplib';
import type {
  EventBus,
  IntegrationEvent,
  IntegrationEventCallback,
  IntegrationEventSubscriber,
  Subscription,
} from '@ddd-ts-kit/kernel';
import { ATTEMPT_HEADER } from './codec/headers';
import { republication } from './codec/republication';
import { BrokerLink } from './connection/broker-link';
import { answeredWithin } from './connection/answered-within';
import { Deadline } from './connection/deadline';
import { openedWithin } from './connection/opened-within';
import { within } from './connection/within';
import { Consumption } from './consumption/consumption';
import { ConsumerNameRequiredError } from './errors/consumer-name-required-error';
import { MESSAGING_SYSTEM } from './messaging-system';
import { EventBusClosedError } from './errors/event-bus-closed-error';
import { ignore } from './ignore';
import type { RabbitMqEventBusOptions } from './options/rabbit-mq-event-bus-options';
import type { Settings } from './options/settings';
import { settingsOf } from './options/settings-of';
import { Publications } from './publication/publications';
import { conceal } from './secrecy/conceal';
import { Confirmations } from './publication/confirmations';
import type { ConsumerBinding } from './topology/consumer-binding';
import { declareTopology } from './topology/declare-topology';
import { queueNamesOf } from './topology/queue-names-of';
import type { RabbitMqTopology } from './topology/rabbit-mq-topology';
import { topologyOf } from './topology/topology-of';
import type { TopologySettings } from './topology/topology-settings';

const DESCRIPTION = 'RabbitMqEventBus [connection concealed]';

/**
 * The provider for RabbitMQ and other AMQP 0-9-1 brokers.
 *
 * Publishing: a durable topic exchange, routing key = event type, persistent messages, and
 * `publish` resolves only when the broker confirmed every message, so it is a safe target for
 * the outbox relay. Consuming: a durable queue per consumer and event type, acknowledged
 * after the handlers resolved, a bounded number of delayed retries, then a dead queue.
 * Delivery is at least once and unordered: consumers deduplicate.
 */
export class RabbitMqEventBus implements EventBus {
  /** Read by what observes the bus from outside: the name of the transport. */
  readonly messagingSystem = MESSAGING_SYSTEM;

  private readonly settings: Settings;

  private readonly link: BrokerLink;

  private readonly publications: Publications;

  private readonly consumption: Consumption;

  private closed = false;

  constructor(options: RabbitMqEventBusOptions) {
    this.settings = settingsOf(options, connect);

    const channelLost = (): void => {
      this.link.restart();
    };

    this.publications = new Publications({ ...this.settings, channelLost });

    this.consumption = new Consumption({
      ...this.settings,
      topology: topologySettingsOf(this.settings),
      channelLost,
    });

    this.link = new BrokerLink(this.settings, {
      opened: async (model) => {
        await this.publications.attach(model);
        await this.consumption.attach(model);
      },
      lost: () => {
        this.publications.detach();
        this.consumption.detach();
      },
      failed: (code) => {
        this.settings.onFailure({ kind: 'connection', code });
      },
    });

    conceal(this);
  }

  /** Messages delivered to this bus whose handlers have not finished yet. */
  get deliveriesInFlight(): number {
    return this.consumption.inFlight;
  }

  /**
   * Resolves when the broker confirmed every event, rejects otherwise: nothing is buffered
   * for later, so the caller (the outbox relay) knows what to retry. One deadline,
   * `publishTimeoutMs`, bounds the whole call, the opening of the connection included.
   */
  async publish(events: readonly IntegrationEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const deadline = new Deadline(this.settings.publishTimeoutMs);

    await deadline.answered(this.readyToPublish());
    await this.publications.publish(events, deadline.leftMs);
  }

  /** Subscribes the consumer named by the `consumer` option. */
  subscribe(type: string, handler: IntegrationEventCallback): Subscription {
    if (this.settings.consumer === undefined) {
      throw new ConsumerNameRequiredError();
    }

    return this.consume({ consumer: this.settings.consumer, type }, handler);
  }

  /** A subscriber for one consuming context, on the connection of this bus. */
  forConsumer(consumer: string): IntegrationEventSubscriber {
    if (consumer.length === 0) {
      throw new ConsumerNameRequiredError();
    }

    return { subscribe: (type, handler) => this.consume({ consumer, type }, handler) };
  }

  /**
   * Connects if needed and declares the exchange, the queues and the bindings of the
   * subscriptions made so far. Idempotent. Resolves once those subscriptions are consuming.
   * One deadline, `publishTimeoutMs`, bounds the whole call, however many declarations it makes.
   */
  async assertTopology(): Promise<void> {
    const deadline = new Deadline(this.settings.publishTimeoutMs);
    const model = await deadline.answered(this.link.opened());
    // On a channel of its own: a refused declaration closes the channel it was made on.
    const channel = await deadline.opened(model.createChannel());

    channel.on('error', ignore);

    try {
      await deadline.answered(declareTopology(channel, this.describeTopology()));
    } finally {
      // In the time left: once the deadline passed, the close is not waited for.
      await within(deadline.leftMs, channel.close().catch(ignore));
    }

    await deadline.answered(this.consumption.started());
  }

  describeTopology(): RabbitMqTopology {
    return topologyOf(topologySettingsOf(this.settings), this.consumption.bindings());
  }

  /**
   * Moves up to `limit` messages from the dead queue of a consumer back to its work queue,
   * with a fresh attempt budget. Returns how many were moved. Each wait is bounded by
   * `publishTimeoutMs`: a copy the broker does not confirm in time rejects the replay with
   * `PUBLISH_NOT_CONFIRMED`, a channel or a message it does not hand over in time with
   * `BROKER_UNAVAILABLE` (`REQUEST_TIMEOUT`), and the message stays dead.
   */
  async replayDead(binding: ConsumerBinding, limit = 100): Promise<number> {
    const { work, dead } = queueNamesOf(binding);
    const { publishTimeoutMs } = this.settings;
    const model = await this.link.opened();
    const channel = await openedWithin(publishTimeoutMs, model.createConfirmChannel());
    const confirmations = new Confirmations(publishTimeoutMs);

    channel.on('error', () => undefined);
    let replayed = 0;

    try {
      for (; replayed < limit; replayed += 1) {
        const message = await answeredWithin(publishTimeoutMs, channel.get(dead, { noAck: false }));

        if (message === false) {
          break;
        }

        await confirmations.ofCopy(channel, work, republication(message, { [ATTEMPT_HEADER]: 1 }));
        channel.ack(message);
      }
    } finally {
      // Closing hands back a message whose copy was not confirmed, or handed over too late: it stays dead.
      await within(
        publishTimeoutMs,
        channel.close().catch(() => undefined),
      );
    }

    return replayed;
  }

  /** Stops consuming, waits for the handlers and the confirmations in flight, disconnects. */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    await this.consumption.drain();
    await this.publications.close();
    await this.link.close();
  }

  /** What a serialisation shows of the bus: its name, never its connection. */
  toJSON(): string {
    return DESCRIPTION;
  }

  /** What `console.log` and `util.inspect` show of the bus: the same. */
  [inspect.custom](): string {
    return DESCRIPTION;
  }

  private async readyToPublish(): Promise<void> {
    await this.link.opened();
    // The queues of this bus are bound before it publishes: it never misses its own events.
    await this.consumption.started();
  }

  /** Adds a handler to the queue of one consumer for one type, and connects if needed. */
  private consume(binding: ConsumerBinding, handler: IntegrationEventCallback): Subscription {
    if (this.closed) {
      throw new EventBusClosedError();
    }

    const subscription = this.consumption.add(binding, handler);

    // Connects in the background; a failure is reported by the link and retried.
    void this.link.opened().catch(() => undefined);

    return subscription;
  }
}

function topologySettingsOf(settings: Settings): TopologySettings {
  return {
    exchange: settings.exchange,
    queueType: settings.queueType,
    retryDelayMs: settings.retry.delayMs,
  };
}
