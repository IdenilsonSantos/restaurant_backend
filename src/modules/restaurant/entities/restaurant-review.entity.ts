import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('restaurant_reviews')
@Unique('UQ_review_customer_order', ['customerId', 'orderId'])
export class RestaurantReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  restaurantId!: string;

  @Index()
  @Column({ type: 'uuid' })
  customerId!: string;

  /** Garante que o cliente realmente fez o pedido */
  @Column({ type: 'uuid' })
  orderId!: string;

  /** Nota de 1 a 5 */
  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne('Restaurant', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restaurantId' })
  restaurant!: any;

  @ManyToOne('User')
  @JoinColumn({ name: 'customerId' })
  customer!: any;

  @ManyToOne('Order')
  @JoinColumn({ name: 'orderId' })
  order!: any;
}
