import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  userId!: string;

  @Column({ type: 'varchar' })
  vehicleType!: string;

  @Column({ type: 'varchar' })
  licensePlate!: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 5.0 })
  rating!: number;

  @Index()
  @Column({ type: 'boolean', default: false })
  isAvailable!: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  currentLatitude!: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  currentLongitude!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToOne('User', 'driver')
  @JoinColumn({ name: 'userId' })
  user!: any;

  @OneToMany('Delivery', 'driver')
  deliveries!: any[];
}
