import { Restaurant } from '../entities/restaurant.entity';

export interface RestaurantWithDistance extends Restaurant {
  /** km calculado em tempo real via Haversine. Presente apenas com lat+lng. */
  distanceKm?: number;
  /** estimatedDeliveryMinutes + ceil(distanceKm * 2) — assume ~30 km/h */
  adjustedDeliveryMinutes?: number;
}
