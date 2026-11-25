import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unitOfWorkContract } from '../src/contracts';
import { CollectingRunner } from './support/collecting-runner';
import { TransactionalMemory } from './support/transactional-memory';

// The globals of the runner are passed as they are: the suites import no runner themselves.
const runner = { describe, it, expect, beforeEach, afterEach };

unitOfWorkContract(runner, {
  name: 'a unit of work built on unitOfWorkOver',
  createUnitOfWork: () => new TransactionalMemory(),
});

// A database of one connection: nothing outside the unit of work to look from.
unitOfWorkContract(runner, {
  name: 'a unit of work built on unitOfWorkOver, over a database of one connection',
  createUnitOfWork: () => {
    const memory = new TransactionalMemory();

    return {
      unitOfWork: memory.unitOfWork,
      outbox: memory.outbox,
      insert: (id) => memory.insert(id),
      insertRefusedAtCommit: (id) => memory.insertRefusedAtCommit(id),
      ids: () => memory.ids(),
    };
  },
});

describe('the unit of work contract and an adapter that forgot unitOfWorkOver', () => {
  it('fails it wherever the events would have left before the end or the handlers run before the commit', async () => {
    const collecting = new CollectingRunner();

    unitOfWorkContract(collecting, {
      name: 'forgetful',
      createUnitOfWork: () => new TransactionalMemory({ cooperating: false }),
    });

    const { failed, passed } = await collecting.run();

    expect(failed).toEqual([
      'dispatches nothing before the work returned: every handler sees every save',
      'dispatches what a handler saved after the events already waiting, once, in the same transaction',
      'joins the unit of work in progress on a nested run: one dispatch, at the end of the outermost',
      'opens a unit of work of its own inside the one of another database: both phases around its own commit',
      'dispatches once the command handler returned, and queues behind them what a command sent by a handler saved',
      'runs no handler of the earlier saves when a later save is refused: nothing stored, nothing in the outbox',
      'runs no handler when the work fails after a save: nothing stored, nothing in the outbox',
      'puts an aggregate back as a rolled back unit of work found it: the same instance is saved again, its events dispatched once',
      'refuses to commit once a nested run failed, although the work caught its failure: nothing stored, no handler',
      'fails the unit of work when a before-commit handler fails: state and outbox rolled back, no after-commit handler',
      'rolls back with its before-commit handler that fails, opened inside the unit of work of another database',
      'rolls back what the before-commit handlers wrote when the commit itself fails, and runs no after-commit handler',
      'runs the after-commit handlers once the rows are committed, visible from outside the transaction',
      'reports the after-commit handler that fails, runs the others and answers the caller',
      'refuses the save of an after-commit handler before it writes, and runs the unit of work it opens apart',
    ]);

    expect(passed).toHaveLength(5);
  });
});
