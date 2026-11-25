import type { Knex } from 'knex';
import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
{{#if style.declared}}
import { Repository } from '@ddd-ts-kit/kernel/declarations';
{{/if}}
import { type KnexContext, saveAggregate } from '@ddd-ts-kit/knex';
import type { Account } from '{{alias.context}}/domain/aggregates/account.aggregate{{alias.ext}}';
{{#if style.declared}}
import { AccountRepository } from '{{alias.context}}/domain/repositories/account.repository{{alias.ext}}';
{{/if}}
{{#unless style.declared}}
import type { AccountRepository } from '{{alias.context}}/domain/repositories/account.repository{{alias.ext}}';
{{/unless}}
import { {{context.constant}}_SCHEMA } from '{{alias.context}}/infrastructure/persistence/{{context.kebab}}.schema{{alias.ext}}';
import { AccountMapper } from '{{alias.context}}/infrastructure/persistence/account.mapper{{alias.ext}}';
import type { AccountRow } from '{{alias.context}}/infrastructure/persistence/account-row.schema{{alias.ext}}';

const TABLE = { schema: {{context.constant}}_SCHEMA, table: 'accounts' };

{{#if style.declared}}
@Repository(AccountRepository)
{{/if}}
export class KnexAccountRepository implements AccountRepository {
  constructor(
    private readonly database: KnexContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Account | undefined> {
    const row = await tableOf(this.database).where({ id }).first();

    return row === undefined ? undefined : AccountMapper.toDomain(row);
  }

  async save(saved: Account): Promise<void> {
    await saveAggregate(this.database, TABLE, {
      aggregate: saved,
      row: AccountMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}

/** A function and not a method: a query builder is thenable, and a method that answers one is read as asynchronous by whatever wraps the adapter (tracing), which then answers a promise. */
function tableOf(database: KnexContext): Knex.QueryBuilder<AccountRow, AccountRow[]> {
  const table = database.executor()<AccountRow, AccountRow[]>('accounts');

  return table.withSchema({{context.constant}}_SCHEMA);
}
