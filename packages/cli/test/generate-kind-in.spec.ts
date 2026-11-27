import { describe, expect, it } from 'vitest';
import { kindIn } from '../src/generate/kind-in';

const kindOf = (...argv: string[]): string | undefined => kindIn(argv)?.name;

describe('the kind a command line of generate asks for', () => {
  it('is its first word when no flag stands before it', () => {
    expect(kindOf('job', 'billing', 'Remind', '--command', 'CancelInvoice')).toBe('job');
    expect(kindOf('vo', 'billing', 'Amount')).toBe('value-object');
  });

  it('is found past a flag before it, the flag read as that kind reads it', () => {
    expect(kindOf('--module', 'pricing', 'job', 'catalog', 'Reprice')).toBe('job');
    expect(kindOf('--command', 'CancelInvoice', 'job', 'billing', 'Remind')).toBe('job');
    expect(kindOf('--command', 'route', 'billing', 'ArchiveInvoice')).toBe('route');
    expect(kindOf('--command=CancelInvoice', 'background-job', 'billing', 'Remind')).toBe('background-job');
    expect(kindOf('--name', 'entity', 'entity', 'billing', 'Fee')).toBe('entity');
  });

  it('takes as the value of a text the name of a kind that reads it as a text', () => {
    // `--command <UseCase>` of a job takes `job`: a use case may be named so, the kind is the next word.
    expect(kindOf('--command', 'job', 'job', 'billing', 'Remind')).toBe('job');
    expect(kindOf('--command', 'job', 'route', 'billing', 'ArchiveInvoice')).toBeUndefined();
  });

  it('is none when no word names a kind that stands first as it reads the flags', () => {
    expect(kindOf('--command', 'CancelInvoice', 'route', 'billing', 'ArchiveInvoice')).toBeUndefined();
    expect(kindOf('billing', 'entity', 'Fee')).toBeUndefined();
    expect(kindOf('--help')).toBeUndefined();
  });
});
