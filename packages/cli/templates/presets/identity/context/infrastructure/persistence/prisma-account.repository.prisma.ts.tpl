import { saveAggregate } from '@ddd-ts-kit/prisma';
import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
import type { Account } from '{{alias.context}}/domain/aggregates/account.aggregate{{alias.ext}}';
{{#if style.declared}}
import { AccountRepository } from '{{alias.context}}/domain/repositories/account.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { AccountRepository } from '{{alias.context}}/domain/repositories/account.repository{{alias.ext}}';
{{/unless}}
import type { Database } from '{{alias.platform}}/database/database{{alias.ext}}';
import { AccountMapper } from '{{alias.context}}/infrastructure/persistence/account.mapper{{alias.ext}}';

{{#if style.declared}}
@Repository(AccountRepository)
{{/if}}
export class PrismaAccountRepository implements AccountRepository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Account | undefined> {
    const row = await accountsOf(this.database).findUnique({ where: { id } });

    return row === null ? undefined : AccountMapper.toDomain(row);
  }

  async save(saved: Account): Promise<void> {
    await saveAggregate(accountsOf(this.database), {
      aggregate: saved,
      row: AccountMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}

/** The accounts on the client of the unit of work, which every statement of this file goes through. */
function accountsOf(database: Database): ReturnType<Database['client']>['{{context.camel}}Account'] {
  return database.client().{{context.camel}}Account;
}
