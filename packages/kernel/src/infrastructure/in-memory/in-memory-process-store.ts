import type { ProcessStore } from '../../application/ports/process-store';
import type { StoredProcess } from '../../application/process/stored-process';
import { ConcurrencyError } from '../../domain/errors/concurrency-error';
import { compositeKey } from './composite-key';

/** The instances of the process managers in the memory of the process, as JSON: for tests and one process. Not transactional. */
export class InMemoryProcessStore implements ProcessStore {
  private readonly processes = new Map<string, StoredProcess>();

  async load(name: string, id: string): Promise<StoredProcess | undefined> {
    const stored = this.processes.get(compositeKey(name, id));

    return stored === undefined ? undefined : copyOf(stored);
  }

  async save(process: StoredProcess): Promise<void> {
    const key = compositeKey(process.name, process.id);
    const current = this.processes.get(key)?.version ?? 0;

    if (process.version !== current + 1) {
      throw new ConcurrencyError(`${process.name}:${process.id}`);
    }

    this.processes.set(key, copyOf(process));
  }

  /** Every instance, in the order they started: for assertions. */
  list(): StoredProcess[] {
    return [...this.processes.values()].map(copyOf);
  }
}

function copyOf(process: StoredProcess): StoredProcess {
  const state: unknown = process.state === undefined ? null : JSON.parse(JSON.stringify(process.state));

  return { ...process, state, timeouts: { ...process.timeouts } };
}
