import { inspect } from 'node:util';
import type { ChannelModel } from 'amqplib';
import { BrokerUnavailableError } from '../errors/broker-unavailable-error';
import { EventBusClosedError } from '../errors/event-bus-closed-error';
import { connectionFailureCode } from '../errors/connection-failure-code';
import { failureCode } from '../errors/failure-code';
import { ignore } from '../ignore';
import type { ReconnectOptions } from '../options/reconnect-options';
import { conceal } from '../secrecy/conceal';
import { answeredWithin } from './answered-within';
import { openedWithin } from './opened-within';
import { within } from './within';

export interface LinkHooks {
  /** Sets channels, topology and consumers up on a fresh connection. A failure retries. */
  opened(model: ChannelModel): Promise<void>;
  /** The connection is gone: what was set up on it is void. */
  lost(): void;
  failed(code: string): void;
}

export interface LinkSettings {
  readonly open: () => Promise<ChannelModel>;
  readonly reconnect: Required<ReconnectOptions>;
  /** The time the broker has to open the connection, then to answer what the hooks set up on it. */
  readonly publishTimeoutMs: number;
}

const DESCRIPTION = 'BrokerLink [connection concealed]';

/**
 * The one connection of a bus, kept alive: when it drops, it is opened again after a delay
 * that grows with each failed attempt, and the hooks rebuild what lived on it. An attempt the
 * broker stops answering fails in time and is retried: it never holds the link.
 */
export class BrokerLink {
  private model: ChannelModel | undefined;

  private opening: Promise<ChannelModel> | undefined;

  private retry: ReturnType<typeof setTimeout> | undefined;

  private failures = 0;

  private closed = false;

  constructor(
    private readonly settings: LinkSettings,
    private readonly hooks: LinkHooks,
  ) {
    conceal(this);
  }

  /**
   * The live connection. Opens the first one, joins an attempt in progress, and fails at
   * once between two attempts so that a publisher never hangs on a broker that is down.
   */
  async opened(): Promise<ChannelModel> {
    if (this.closed) {
      throw new EventBusClosedError();
    }

    if (this.model !== undefined) {
      return this.model;
    }

    if (this.opening === undefined && this.retry === undefined) {
      this.open();
    }

    if (this.opening === undefined) {
      throw new BrokerUnavailableError('RECONNECTING');
    }

    return this.opening;
  }

  /** Drops the connection so that everything is rebuilt, after a channel died on its own. */
  restart(): void {
    const model = this.model;

    if (model !== undefined) {
      this.lost(model);
      void model.close().catch(ignore);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    clearTimeout(this.retry);
    this.retry = undefined;
    const model = this.model ?? (await this.opening?.catch(ignore));

    this.model = undefined;

    if (model !== undefined) {
      await this.closeInTime(model);
    }
  }

  toJSON(): string {
    return DESCRIPTION;
  }

  [inspect.custom](): string {
    return DESCRIPTION;
  }

  private open(): void {
    const opening = this.establish();

    this.opening = opening;

    void opening
      .then(
        () => {
          this.failures = 0;
        },
        (error: unknown) => {
          this.failed(connectionFailureCode(error));
        },
      )
      .finally(() => {
        this.opening = undefined;
      });
  }

  private async establish(): Promise<ChannelModel> {
    const { publishTimeoutMs } = this.settings;
    const model = await openedWithin(publishTimeoutMs, this.connect());

    model.on('error', ignore);

    model.on('close', () => {
      this.lost(model);
    });

    try {
      await answeredWithin(publishTimeoutMs, this.hooks.opened(model));
    } catch (error) {
      this.hooks.lost();
      await this.closeInTime(model);
      throw unavailable(error);
    }

    if (this.closed) {
      await this.closeInTime(model);
      throw new EventBusClosedError();
    }

    this.model = model;

    return model;
  }

  private async connect(): Promise<ChannelModel> {
    try {
      return await this.settings.open();
    } catch (error) {
      // Rethrown without its message or cause: a connection error may quote the URL.
      throw new BrokerUnavailableError(failureCode(error));
    }
  }

  /** A broker that stopped answering does not answer a close either: it is not waited for longer. */
  private async closeInTime(model: ChannelModel): Promise<void> {
    await within(this.settings.publishTimeoutMs, model.close().catch(ignore));
  }

  private lost(model: ChannelModel): void {
    if (this.model !== model) {
      return;
    }

    this.model = undefined;
    this.hooks.lost();

    if (!this.closed) {
      this.failed('CONNECTION_LOST');
    }
  }

  private failed(code: string): void {
    if (this.closed) {
      return;
    }

    this.hooks.failed(code);
    const { initialMs, factor, maxMs } = this.settings.reconnect;
    const delay = Math.min(maxMs, initialMs * factor ** this.failures);

    this.failures += 1;

    this.retry = setTimeout(() => {
      this.retry = undefined;
      this.open();
    }, delay);
  }
}

// A request the broker did not answer in time keeps its reason; any other failure gives its code.
function unavailable(error: unknown): BrokerUnavailableError {
  return error instanceof BrokerUnavailableError ? error : new BrokerUnavailableError(failureCode(error));
}
