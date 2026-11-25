import { eq } from 'drizzle-orm';
import { saveAggregate } from '@ddd-ts-kit/drizzle/postgres';
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
import { accounts } from '{{alias.context}}/infrastructure/persistence/{{context.kebab}}.schema{{alias.ext}}';
import { AccountMapper } from '{{alias.context}}/infrastructure/persistence/account.mapper{{alias.ext}}';

{{#if style.declared}}
@Repository(AccountRepository)
{{/if}}
export class DrizzleAccountRepository implements AccountRepository {
  constructor(
    private readonly database: Database,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Account | undefined> {
    const [row] = await executorOf(this.database).select().from(accounts).where(eq(accounts.id, id));

    return row === undefined ? undefined : AccountMapper.toDomain(row);
  }

  async save(saved: Account): Promise<void> {
    await saveAggregate(this.database, accounts, {
      aggregate: saved,
      row: AccountMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}

/** The executor of the unit of work, which every statement of this file goes through. */
function executorOf(database: Database): ReturnType<Database['executor']> {
  return database.executor();
}
