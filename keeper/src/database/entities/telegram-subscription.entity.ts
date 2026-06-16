import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'keeper_telegram_subscriptions' })
@Index(['account_id'])
export class TelegramSubscriptionEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  chat_id!: string;

  @PrimaryColumn({ type: 'varchar', length: 66 })
  account_id!: string;

  @Column({ type: 'varchar', length: 66 })
  owner!: string;

  @Column({ type: 'bigint' })
  subscribed_at_ms!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  telegram_username!: string | null;
}
