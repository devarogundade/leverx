import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'keeper_telegram_link_tokens' })
@Index(['expires_at_ms'])
export class TelegramLinkTokenEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  token!: string;

  @Column({ type: 'varchar', length: 66 })
  account_id!: string;

  @Column({ type: 'varchar', length: 66 })
  owner!: string;

  @Column({ type: 'bigint' })
  expires_at_ms!: string;
}
