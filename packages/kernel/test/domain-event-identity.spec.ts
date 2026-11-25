import { describe, expect, it } from 'vitest';
import {
  Criteria,
  EventSerializer,
  EventSourcedRepository,
  InMemoryEventStore,
  InMemoryReadModelStore,
  InMemorySubjectKeyStore,
  PersonalDataCipher,
  defineCriteria,
  eventIdOf,
  loadedAt,
  optimisticUpdate,
  rankOf,
  ranked,
  recordedEventsOf,
  scoped,
  stampOf,
  takeRecordedEvents,
  type DomainEvent,
} from '../src';
import { AT, Account, type AccountEvent, type AccountState } from './support/bank/account';
import { accountEvents } from './support/bank/account-events';
import { Cart } from './support/shop/cart';

const saved = (cart: Cart): Promise<void> => optimisticUpdate(cart, async () => 1);
const ranksOf = (aggregate: object): number[] => recordedEventsOf(aggregate).map(rankOf);

describe('the rank of a domain event in its aggregate', () => {
  it('is given by the aggregate that records it, from 1, in the order of the facts', () => {
    const cart = Cart.open('c1');

    cart.add('pen');
    cart.empty();

    expect(ranksOf(cart)).toEqual([1, 2, 3]);
  });

  it('goes on after a save, whether the events were handed over or still wait for the commit', async () => {
    const cart = Cart.open('c1');

    cart.add('pen');
    await saved(cart);
    cart.add('ink');

    expect(ranksOf(cart)).toEqual([1, 2, 3]);

    takeRecordedEvents(cart);
    await saved(cart);
    cart.empty();

    expect(ranksOf(cart)).toEqual([4]);
  });

  it('goes on from the version an aggregate is loaded at: the version follows the ranks', async () => {
    const cart = Cart.open('c1');

    cart.add('pen');
    cart.add('ink');
    await saved(cart);

    expect(cart.version).toBe(3);

    const loaded = loadedAt(Cart.rehydrate('c1'), cart.version);

    loaded.empty();

    expect(ranksOf(loaded)).toEqual([4]);
  });

  it('moves the version by one for a save that recorded nothing', async () => {
    const cart = loadedAt(Cart.rehydrate('c1'), 6);

    await saved(cart);

    expect(cart.version).toBe(7);
  });

  it('is the version of the event in its stream, for an event-sourced aggregate', async () => {
    const { store, accounts } = aBank();
    const account = Account.open('a1', 'Ada').deposit(5);

    await accounts.save(account);
    account.deposit(7);

    const stored = await store.readStream('bank.account-a1');

    expect(ranksOf(account)).toEqual([...stored.map(({ version }) => version), 3]);
  });

  it('is kept out of what the event shows', () => {
    const event = ranked({ name: 'shop.cart.opened', aggregateId: 'c1', occurredAt: AT }, 4);

    expect([Object.keys(event), JSON.stringify(event)]).toEqual([
      ['name', 'aggregateId', 'occurredAt'],
      JSON.stringify({ name: 'shop.cart.opened', aggregateId: 'c1', occurredAt: AT }),
    ]);
  });

  it('is given once: an event another aggregate recorded, or the same one twice, is refused', () => {
    const cart = Cart.open('c1');
    const [opened] = recordedEventsOf(cart);

    expect(() => ranked(opened ?? fact('opened'), 2)).toThrow(
      '"shop.cart.opened" already stands at rank 1 of c1: a fact is recorded once, build another event',
    );

    expect(ranked(opened ?? fact('opened'), 1)).toBe(opened);
  });

  it('is refused for an event no aggregate recorded', () => {
    expect(() => rankOf(fact('opened'))).toThrow(
      '"shop.cart.opened" of c1 has no rank: no aggregate recorded it. Let the aggregate record it, or say where it stands with ranked(event, rank)',
    );
  });
});

describe('the identity of a domain event', () => {
  it('is its name, its aggregate and its rank there', () => {
    expect(eventIdOf(ranked(fact('emptied'), 12))).toBe('shop.cart.emptied:c1:12');
  });

  it('is the same for the event a save dispatched and for the one read back from its stream', async () => {
    const { store, serializer, accounts } = aBank();
    const account = Account.open('a1', 'Ada').deposit(5);
    const live = recordedEventsOf(account).map((event) => stampOf(event));

    await accounts.save(account);

    const stored = await store.readStream('bank.account-a1');
    const replayed = await Promise.all(stored.map((event) => serializer.deserialize(event)));

    expect(replayed.map((event) => stampOf(event))).toEqual(live);
    expect(stored.map(({ id }) => id)).toEqual(['bank.account.opened:a1:1', 'bank.account.deposited:a1:2']);
  });
});

describe('a read model fed by the events one command records', () => {
  interface OrderRow {
    readonly id: string;
    readonly status: string;
    readonly lines: number;
  }

  const orders = defineCriteria<OrderRow>({
    fields: { id: { type: 'string', sortable: true }, status: { type: 'string' }, lines: { type: 'number' } },
    tieBreaker: 'id',
  });

  it('applies every event of one aggregate at the same instant, whatever their names', async () => {
    const store = new InMemoryReadModelStore(orders);
    const cart = Cart.open('c1');

    cart.add('pen');
    cart.add('pen');
    cart.empty();

    const writes: string[] = [];

    for (const event of recordedEventsOf(cart)) {
      writes.push(
        await store.upsertIfNewer('c1', stampOf(event), (row) => ({
          id: 'c1',
          status: event.name,
          lines: (row?.lines ?? 0) + (event.name === 'shop.cart.added-pen' ? 1 : 0),
        })),
      );
    }

    const { items } = await store.search(scoped(Criteria.of<OrderRow>().orderBy('id'), { kind: 'all' }));

    expect(writes).toEqual(['applied', 'applied', 'applied', 'applied']);
    expect(items).toEqual([{ id: 'c1', status: 'shop.cart.emptied', lines: 2 }]);
  });

  it('keeps a row from an event of the aggregate delivered again or late', async () => {
    const store = new InMemoryReadModelStore(orders);
    const cart = Cart.open('c1');

    cart.empty();

    const [opened, emptied] = recordedEventsOf(cart).map((event) => ({ event, stamp: stampOf(event) }));

    const write = (delivered = opened): Promise<string> =>
      store.upsertIfNewer('c1', delivered?.stamp ?? stampOf(fact('none')), () => ({
        id: 'c1',
        status: delivered?.event.name ?? '',
        lines: 0,
      }));

    expect([await write(emptied), await write(opened), await write(emptied)]).toEqual(['applied', 'stale', 'stale']);
  });
});

function aBank(): {
  readonly store: InMemoryEventStore;
  readonly serializer: EventSerializer<AccountEvent>;
  readonly accounts: EventSourcedRepository<Account, AccountEvent, AccountState>;
} {
  const store = new InMemoryEventStore();

  const serializer = new EventSerializer<AccountEvent>(accountEvents, {
    cipher: new PersonalDataCipher(new InMemorySubjectKeyStore()),
  });

  const accounts = new EventSourcedRepository<Account, AccountEvent, AccountState>({
    store,
    serializer,
    category: 'bank.account',
    rehydrate: (id, history) => Account.rehydrate(id, history),
  });

  return { store, serializer, accounts };
}

function fact(name: string): DomainEvent {
  return { name: `shop.cart.${name}`, aggregateId: 'c1', occurredAt: AT };
}
