import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { JarvisEventType } from '../../jarvis/jarvis.schemas';

@Entity({ name: 'keeper_jarvis_events' })
@Index(['user_address', 'account_id', 'created_at_ms'])
export class JarvisEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 66 })
  user_address!: string;

  @Column({ type: 'varchar', length: 66 })
  account_id!: string;

  @Column({ type: 'varchar', length: 32 })
  event_type!: JarvisEventType;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  read!: boolean;

  @Column({ type: 'bigint' })
  created_at_ms!: string;
}
