import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'keeper_user_managers' })
export class UserManagerEntity {
  @PrimaryColumn({ type: 'varchar', length: 66 })
  user_address!: string;

  @Column({ type: 'varchar', length: 66 })
  manager_id!: string;

  @Column({ type: 'bigint', nullable: true })
  updated_at_ms!: string | null;
}
