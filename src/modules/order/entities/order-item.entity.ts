import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  orderId!: string;

  @Column({ type: 'uuid' })
  productId!: string;

  @Column({ type: 'varchar' })
  productName!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  productPrice!: number;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal!: number;

  @ManyToOne('Order', 'items')
  @JoinColumn({ name: 'orderId' })
  order!: any;

  @ManyToOne('Product', 'orderItems')
  @JoinColumn({ name: 'productId' })
  product!: any;
}
