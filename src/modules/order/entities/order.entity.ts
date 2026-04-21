import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderStatus } from '../../../common/enums/order-status.enum';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  customerId!: string;

  @Index()
  @Column({ type: 'uuid' })
  restaurantId!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount!: number;

  @Column({ type: 'varchar' })
  deliveryAddress!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  deliveryLatitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  deliveryLongitude!: number;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne('User', 'orders')
  @JoinColumn({ name: 'customerId' })
  customer!: any;

  @ManyToOne('Restaurant', 'orders')
  @JoinColumn({ name: 'restaurantId' })
  restaurant!: any;

  @OneToMany('OrderItem', 'order')
  items!: any[];

  @OneToOne('Delivery', 'order')
  delivery!: any;

  @OneToOne('Payment', 'order')
  payment!: any;
}
