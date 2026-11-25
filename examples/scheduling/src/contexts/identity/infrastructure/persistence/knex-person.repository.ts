import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
import { Repository } from '@ddd-ts-kit/kernel/declarations';
import { KnexContext, saveTenantAggregate, tenantTable } from '@ddd-ts-kit/knex';
import type { Person } from '@/contexts/identity/domain/aggregates/person.aggregate';
import { PersonRepository } from '@/contexts/identity/domain/repositories/person.repository';
import { IDENTITY_SCHEMA } from '@/contexts/identity/infrastructure/persistence/identity.schema';
import { PersonMapper } from '@/contexts/identity/infrastructure/persistence/person.mapper';
import type { PersonRow } from '@/contexts/identity/infrastructure/persistence/person-row.schema';

/** Tenant data: every statement reaches it through `tenantTable` or `saveTenantAggregate`, confined to the tenant of the work. */
const TABLE = { schema: IDENTITY_SCHEMA, table: 'persons' };

@Repository(PersonRepository)
export class KnexPersonRepository implements PersonRepository {
  constructor(
    private readonly database: KnexContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Person | undefined> {
    const row = await tenantTable<PersonRow>(this.database, this.scope, TABLE).where({ id }).first();

    return row === undefined ? undefined : PersonMapper.toDomain(row);
  }

  async save(saved: Person): Promise<void> {
    await saveTenantAggregate(this.database, TABLE, {
      aggregate: saved,
      row: PersonMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}
