import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

@Entity('user_favorite_restaurants')
@Index('IDX_favorite_user', ['userId'])
@Index('IDX_favorite_restaurant', ['restaurantId'])
export class UserFavoriteRestaurant {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'uuid' })
  restaurantId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: any;

  @ManyToOne('Restaurant', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restaurantId' })
  restaurant!: any;
}
