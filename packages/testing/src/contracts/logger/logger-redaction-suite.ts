import { REDACTED } from '@ddd-ts-kit/kernel';
import type { ContractRunner } from '../contract-runner';
import { ContractSuite } from '../contract-suite';
import type { CreateLogger } from './create-logger';
import type { LoggerUnderContract } from './logger-under-contract';

/** The field name the suite asks the logger to hide, as a project adds one to `CREDENTIAL_KEYS`. */
const ADDED = 'iban';

/** A field name added to the hidden ones: hidden wherever a field comes from, however it is written. */
export class LoggerRedactionSuite extends ContractSuite<LoggerUnderContract> {
  constructor(runner: ContractRunner, createLogger: CreateLogger) {
    super(runner, () =>
      createLogger({
        level: 'debug',
        scrubMessages: false,
        fields: () => ({ Iban: 'FR76 read at the entry', correlationId: 'request-1' }),
        redact: [ADDED],
      }),
    );
  }

  protected tests(): void {
    this.hidesInAnEntry();
    this.hidesInAChild();
  }

  private hidesInAnEntry(): void {
    this.it('hides an added key whatever its case, at the top of an entry and one level below', async () => {
      this.subject.logger.info('transfer sent', {
        iban: 'FR76 lower',
        IBAN: 'FR76 upper',
        account: { iBAN: 'FR76 nested', holder: 'Ada' },
        amount: 12,
      });

      this.expect(await this.written()).toEqual([
        {
          iban: REDACTED,
          IBAN: REDACTED,
          Iban: REDACTED,
          account: { iBAN: REDACTED, holder: 'Ada' },
          amount: 12,
          correlationId: 'request-1',
        },
      ]);
    });
  }

  private hidesInAChild(): void {
    this.it('hides it in the fields of a child too, and still hides the credential keys', async () => {
      const transfers = this.subject.logger.child({ IBAN: 'FR76 bound', mandate: { Iban: 'FR76 bound below' } });

      transfers.warn('transfer refused', { Authorization: 'Bearer abc', headers: { Cookie: 'session=abc' } });

      this.expect(await this.written()).toEqual([
        {
          IBAN: REDACTED,
          Iban: REDACTED,
          mandate: { Iban: REDACTED },
          Authorization: REDACTED,
          headers: { Cookie: REDACTED },
          correlationId: 'request-1',
        },
      ]);
    });
  }

  private async written(): Promise<Record<string, unknown>[]> {
    return (await this.subject.lines()).map(({ fields }) =>
      Object.fromEntries(WRITTEN.filter((key) => fields[key] !== undefined).map((key) => [key, fields[key]])),
    );
  }
}

/** The fields the suite writes: a logger adds its own (a service, a host), which are not compared. */
const WRITTEN = ['iban', 'IBAN', 'Iban', 'account', 'mandate', 'Authorization', 'headers', 'amount', 'correlationId'];
