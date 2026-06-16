import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'keeper_telegram_alert_sent' })
export class TelegramAlertSentEntity {
  @PrimaryColumn({ type: 'varchar', length: 200 })
  alert_key!: string;

  @Column({ type: 'bigint' })
  sent_at_ms!: string;
}
