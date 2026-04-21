import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DeliveryStatus } from '../../../common/enums/delivery-status.enum';

@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  orderId!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  driverId!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: DeliveryStatus,
    default: DeliveryStatus.WAITING,
  })
  status!: DeliveryStatus;

  @Column({ type: 'timestamp', nullable: true })
  pickedUpAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToOne('Order', 'delivery')
  @JoinColumn({ name: 'orderId' })
  order!: any;

  @ManyToOne('Driver', 'deliveries')
  @JoinColumn({ name: 'driverId' })
  driver!: any;
}
