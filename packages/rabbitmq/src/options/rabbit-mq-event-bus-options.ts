import type { ChannelModel, Options } from 'amqplib';
import type { QueueType } from './queue-type';
import type { RabbitMqDelivery } from './rabbit-mq-delivery';
import type { RabbitMqFailure } from './rabbit-mq-failure';
import type { ReconnectOptions } from './reconnect-options';
import type { RetryOptions } from './retry-options';

export const DEFAULT_EXCHANGE = 'integration-events';

export interface RabbitMqEventBusOptions {
  /**
   * An AMQP URL, amqplib connection options, or a factory opening a NEW connection each time
   * it is called (TLS, rotating credentials). The bus owns what it opens and closes it.
   */
  readonly connection: string | Options.Connect | (() => Promise<ChannelModel>);
  /** The durable topic exchange events are published to. Default `integration-events`. */
  readonly exchange?: string;
  /** The consuming context `subscribe` declares its queues for. See also `forConsumer`. */
  readonly consumer?: string;
  /** Unacknowledged messages a queue hands to this bus at once. Default 10. */
  readonly prefetch?: number;
  /** Default `quorum`. */
  readonly queueType?: QueueType;
  /** What `publish` does with an event no queue is bound for. Default `ignore`. */
  readonly onUnroutable?: 'ignore' | 'fail';
  /**
   * Time `publish` may take, the opening of the connection included, before it rejects
   * (`PUBLISH_NOT_CONFIRMED`, or `BROKER_UNAVAILABLE` of reason `REQUEST_TIMEOUT`). It also bounds the
   * confirmation of the copy of a failed message to its retry or dead queue, each request of
   * `replayDead`, and each step of `close()`, which goes on without the answer. Default 30000.
   */
  readonly publishTimeoutMs?: number;
  /**
   * Time a connection or an administrative request may take, as on Kafka: each attempt to open the
   * connection and set it up (retried after it), the start of a subscription, and `assertTopology`
   * as a whole (`BROKER_UNAVAILABLE` of reason `REQUEST_TIMEOUT`). Default 10000.
   */
  readonly connectTimeoutMs?: number;
  readonly retry?: RetryOptions;
  readonly reconnect?: ReconnectOptions;
  /** Observability hook. It receives codes only, so it is safe to log as is. */
  readonly onFailure?: (failure: RabbitMqFailure) => void;
  /** Metrics hook, called once per message a consumer settles, before it is acknowledged. */
  readonly onDelivery?: (delivery: RabbitMqDelivery) => void;
}
