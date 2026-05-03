import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';

@Entity('restaurants')
export class Restaurant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  ownerId!: string;

  @Index()
  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar' })
  address!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  latitude!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  longitude!: number;

  @Column({ type: 'boolean', default: false })
  isOpen!: boolean;

  @Column({ type: 'boolean', default: false })
  isFeatured!: boolean;

  @Column({ type: 'int', default: 30 })
  estimatedDeliveryMinutes!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  averageRating!: number;

  @Column({ type: 'int', default: 0 })
  totalReviews!: number;

  @Column({ type: 'int', default: 0 })
  totalOrders!: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  deliveryFee!: number;

  @Column({ type: 'varchar', nullable: true })
  logoUrl!: string | null;

  @Column({ type: 'varchar', nullable: true })
  bannerUrl!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne('User')
  @JoinColumn({ name: 'ownerId' })
  owner!: any;

  @OneToMany('Product', 'restaurant')
  products!: any[];

  @OneToMany('Order', 'restaurant')
  orders!: any[];

  @ManyToMany(() => PaymentMethod, { eager: true })
  @JoinTable({
    name: 'restaurant_payment_methods',
    joinColumn: { name: 'restaurantId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'paymentMethodId', referencedColumnName: 'id' },
  })
  acceptedPaymentMethods!: PaymentMethod[];
}
