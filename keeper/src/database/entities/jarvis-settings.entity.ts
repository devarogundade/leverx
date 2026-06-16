import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'keeper_jarvis_settings' })
export class JarvisSettingsEntity {
  @PrimaryColumn({ type: 'varchar', length: 66 })
  user_address!: string;

  @PrimaryColumn({ type: 'varchar', length: 66 })
  account_id!: string;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'bigint' })
  created_at_ms!: string;

  @Column({ type: 'bigint' })
  updated_at_ms!: string;

  @Column({ type: 'bigint', nullable: true })
  last_run_at_ms!: string | null;

  @Index()
  @Column({ type: 'boolean', default: false })
  welcome_sent!: boolean;

  @Column({ type: 'int', default: 5 })
  max_leverage!: number;

  @Column({ type: 'int', default: 20 })
  max_portfolio_pct!: number;

  @Column({ type: 'int', default: 3 })
  max_open_positions!: number;

  @Column({ type: 'varchar', length: 16, default: 'balanced' })
  risk_profile!: string;

  @Column({ type: 'boolean', default: false })
  dry_run!: boolean;
}
