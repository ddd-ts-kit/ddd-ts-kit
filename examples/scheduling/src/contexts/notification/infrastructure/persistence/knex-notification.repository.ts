import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
import { Repository } from '@ddd-ts-kit/kernel/declarations';
import { KnexContext, saveTenantAggregate, tenantTable } from '@ddd-ts-kit/knex';
import type { Notification } from '@/contexts/notification/domain/aggregates/notification.aggregate';
import { NotificationRepository } from '@/contexts/notification/domain/repositories/notification.repository';
import { NOTIFICATION_SCHEMA } from '@/contexts/notification/infrastructure/persistence/notification.schema';
import { NotificationMapper } from '@/contexts/notification/infrastructure/persistence/notification.mapper';
import type { NotificationRow } from '@/contexts/notification/infrastructure/persistence/notification-row.schema';

/** Tenant data: every statement reaches it through `tenantTable` or `saveTenantAggregate`, confined to the tenant of the work. */
const TABLE = { schema: NOTIFICATION_SCHEMA, table: 'notifications' };

@Repository(NotificationRepository)
export class KnexNotificationRepository implements NotificationRepository {
  constructor(
    private readonly database: KnexContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Notification | undefined> {
    const row = await tenantTable<NotificationRow>(this.database, this.scope, TABLE).where({ id }).first();

    return row === undefined ? undefined : NotificationMapper.toDomain(row);
  }

  async findByCause(cause: string, recipientId: string): Promise<Notification | undefined> {
    const row = await tenantTable<NotificationRow>(this.database, this.scope, TABLE)
      .where({ cause, recipient_id: recipientId })
      .first();

    return row === undefined ? undefined : NotificationMapper.toDomain(row);
  }

  async save(saved: Notification): Promise<void> {
    await saveTenantAggregate(this.database, TABLE, {
      aggregate: saved,
      row: NotificationMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}
