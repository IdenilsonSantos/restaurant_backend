import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Driver } from '../driver/entities/driver.entity';
import { Delivery } from './entities/delivery.entity';
import { RedisService } from '../redis/redis.service';
import { DeliveryStatus } from '../../common/enums/delivery-status.enum';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
  ) {}

  /**
   * Searches for the best available driver starting at `initialRadiusKm` and
   * expanding by 3 km increments up to MAX_RADIUS (15 km).
   * Returns the driver's DB id, or null if none found.
   */
  async findBestDriver(
    restaurantLat: number,
    restaurantLng: number,
    initialRadiusKm = 3,
  ): Promise<string | null> {
    const MAX_RADIUS = 15;
    const RADIUS_INCREMENT = 3;
    let radius = initialRadiusKm;

    while (radius <= MAX_RADIUS) {
      this.logger.debug(
        `Searching for drivers within ${radius} km of (${restaurantLat}, ${restaurantLng})`,
      );

      const nearbyDriverIds = await this.redisService.geoSearch(
        'drivers:geo',
        restaurantLng,
        restaurantLat,
        radius,
      );

      if (nearbyDriverIds.length > 0) {
        const bestDriverId = await this.scoreAndSelectDriver(
          nearbyDriverIds,
          restaurantLat,
          restaurantLng,
        );
        if (bestDriverId) return bestDriverId;
      }

      radius += RADIUS_INCREMENT;
    }

    this.logger.warn(
      `No available driver found within ${MAX_RADIUS} km of (${restaurantLat}, ${restaurantLng})`,
    );
    return null;
  }

  /**
   * From the candidate driver ids returned by Redis GEO, loads only the ones
   * that are available in the database, scores them and attempts to acquire a
   * distributed lock on the winner. Falls back to the next-best candidate if
   * the lock is already held.
   */
  private async scoreAndSelectDriver(
    driverIds: string[],
    lat: number,
    lng: number,
  ): Promise<string | null> {
    // Load only drivers that are marked available in the DB
    const availableDrivers = await this.driverRepository.find({
      where: { id: In(driverIds), isAvailable: true },
    });

    if (availableDrivers.length === 0) return null;

    // Fetch distances with a single GEOSEARCH WITHDIST call
    const withDist = await this.redisService.geoSearchWithDist(
      'drivers:geo',
      lng,
      lat,
      // Use a generous radius so all candidate drivers are included
      20,
    );

    const distMap = new Map<string, number>(
      withDist.map(({ member, distanceKm }) => [member, distanceKm]),
    );

    // Score = (1 / distance) * 0.6 + (rating / 5) * 0.4
    // Protect against zero distance by flooring at 0.01 km
    const scored = availableDrivers.map((driver) => {
      const dist = Math.max(distMap.get(driver.id) ?? 1, 0.01);
      const score = (1 / dist) * 0.6 + (Number(driver.rating) / 5) * 0.4;
      return { driver, score };
    });

    // Sort descending by score (best first)
    scored.sort((a, b) => b.score - a.score);

    // Try to acquire a lock on each candidate in score order
    for (const { driver } of scored) {
      const lockKey = `driver:${driver.id}`;
      const locked = await this.redisService.acquireLock(lockKey, 30_000);
      if (locked) {
        // Release immediately — assignment will re-acquire in assignDriver
        await this.redisService.releaseLock(lockKey);
        return driver.id;
      }
      this.logger.debug(
        `Lock on driver ${driver.id} is held, trying next candidate`,
      );
    }

    return null;
  }

  /**
   * Atomically assigns a driver to a delivery using a distributed lock.
   * Updates the Delivery row, the Driver availability in the DB, and the
   * driver state key in Redis.
   */
  async assignDriver(deliveryId: string, driverId: string): Promise<void> {
    const lockKey = `driver:${driverId}`;
    const locked = await this.redisService.acquireLock(lockKey, 30_000);

    if (!locked) {
      throw new ConflictException(
        `Driver ${driverId} is already being assigned to another delivery`,
      );
    }

    try {
      // 1. Persist assignment on the Delivery row
      await this.deliveryRepository.update(
        { id: deliveryId },
        { driverId, status: DeliveryStatus.ASSIGNED },
      );

      // 2. Mark driver as unavailable in the DB
      await this.driverRepository.update(
        { id: driverId },
        { isAvailable: false },
      );

      // 3. Update driver state in Redis
      await this.redisService.setDriverState(driverId, 'busy');

      this.logger.log(`Driver ${driverId} assigned to delivery ${deliveryId}`);
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }

  /**
   * Releases the driver back to the available pool after a delivery finishes
   * or fails. Updates DB and Redis.
   */
  async releaseDriver(driverId: string): Promise<void> {
    await this.driverRepository.update({ id: driverId }, { isAvailable: true });
    await this.redisService.setDriverState(driverId, 'available');
    this.logger.log(`Driver ${driverId} released back to available pool`);
  }
}
