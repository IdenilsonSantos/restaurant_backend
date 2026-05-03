import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Restaurant } from './entities/restaurant.entity';
import { Product } from './entities/product.entity';
import { RestaurantReview } from './entities/restaurant-review.entity';
import { UserFavoriteRestaurant } from './entities/user-favorite-restaurant.entity';
import { Order } from '../order/entities/order.entity';
import { PaymentMethod } from '../payment/entities/payment-method.entity';
import 'multer';
import { haversineKm } from './utils/haversine.util';
import { NearbyRestaurantDto } from './dto/nearby-restaurant.dto';
import { SearchRestaurantDto } from './dto/search-restaurant.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { PaginatedReviewsDto } from './dto/paginated-reviews.dto';
import { UpdatePaymentMethodsDto } from './dto/update-payment-methods.dto';
import { RestaurantWithDistance } from './interfaces/restaurant-with-distance.interface';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { StorageService } from '../storage/storage.service';
import { validateImageFile } from './utils/image-upload.config';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { SetDeliveryFeeDto } from './dto/set-delivery-fee.dto';

@Injectable()
export class RestaurantService {
  constructor(
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(RestaurantReview)
    private readonly reviewRepository: Repository<RestaurantReview>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
    @InjectRepository(UserFavoriteRestaurant)
    private readonly favoriteRepository: Repository<UserFavoriteRestaurant>,
    private readonly storageService: StorageService,
  ) {}

  async create(dto: CreateRestaurantDto): Promise<Restaurant> {
    const restaurant = this.restaurantRepository.create(dto);
    return this.restaurantRepository.save(restaurant);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResult<Restaurant>> {
    const [data, total] = await this.restaurantRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<Restaurant> {
    const restaurant = await this.restaurantRepository.findOne({
      where: { id },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant with id "${id}" not found`);
    }

    return restaurant;
  }

  async update(id: string, dto: UpdateRestaurantDto): Promise<Restaurant> {
    const restaurant = await this.findOne(id);
    Object.assign(restaurant, dto);
    return this.restaurantRepository.save(restaurant);
  }

  async remove(id: string): Promise<void> {
    const restaurant = await this.findOne(id);
    await this.restaurantRepository.remove(restaurant);
  }

  async createProduct(dto: CreateProductDto): Promise<Product> {
    await this.findOne(dto.restaurantId);
    const product = this.productRepository.create(dto);
    return this.productRepository.save(product);
  }

  async findProducts(restaurantId: string): Promise<Product[]> {
    await this.findOne(restaurantId);
    return this.productRepository.find({
      where: { restaurantId, isAvailable: true },
      order: { name: 'ASC' },
    });
  }

  async findProductsByIds(
    restaurantId: string,
    productIds: string[],
  ): Promise<Product[]> {
    return this.productRepository.find({
      where: { id: In(productIds), restaurantId, isAvailable: true },
    });
  }

  // ── Busca avançada ──────────────────────────────────────────────────────────

  async search(
    dto: SearchRestaurantDto,
  ): Promise<PaginatedResult<RestaurantWithDistance>> {
    const qb = this.restaurantRepository.createQueryBuilder('r');

    if (dto.onlyOpen) qb.andWhere('r.isOpen = true');
    if (dto.featured) qb.andWhere('r.isFeatured = true');
    if (dto.maxDeliveryMinutes)
      qb.andWhere('r.estimatedDeliveryMinutes <= :max', {
        max: dto.maxDeliveryMinutes,
      });

    const allMatching = await qb.getMany();
    const hasCoords = dto.lat !== undefined && dto.lng !== undefined;

    let enriched: RestaurantWithDistance[] = allMatching.map((r) => {
      const result: RestaurantWithDistance = { ...r };
      if (hasCoords) {
        const distanceKm =
          Math.round(
            haversineKm(
              dto.lat!,
              dto.lng!,
              Number(r.latitude),
              Number(r.longitude),
            ) * 10,
          ) / 10;
        result.distanceKm = distanceKm;
        result.adjustedDeliveryMinutes =
          r.estimatedDeliveryMinutes + Math.ceil(distanceKm * 2);
      }
      return result;
    });

    if (hasCoords && dto.radiusKm !== undefined) {
      enriched = enriched.filter(
        (r) => (r.distanceKm ?? Infinity) <= dto.radiusKm!,
      );
    }

    const sortBy = dto.sortBy ?? (hasCoords ? 'distance' : 'featured');
    enriched.sort((a, b) => {
      switch (sortBy) {
        case 'distance':
          return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
        case 'delivery':
          return (
            (a.adjustedDeliveryMinutes ?? a.estimatedDeliveryMinutes) -
            (b.adjustedDeliveryMinutes ?? b.estimatedDeliveryMinutes)
          );
        case 'rating':
          return Number(b.averageRating) - Number(a.averageRating);
        case 'featured':
        default:
          if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
          return b.totalOrders - a.totalOrders;
      }
    });

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const total = enriched.length;
    const data = enriched.slice((page - 1) * limit, page * limit);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findFeatured(): Promise<RestaurantWithDistance[]> {
    return this.restaurantRepository.find({
      where: { isFeatured: true, isOpen: true },
      order: { totalOrders: 'DESC' },
      take: 10,
    }) as Promise<RestaurantWithDistance[]>;
  }

  /**
   * Restaurantes dentro do raio informado, ordenados do mais próximo ao mais distante.
   * Distância calculada em memória via Haversine — sem PostGIS.
   */
  async findNearby(
    dto: NearbyRestaurantDto,
  ): Promise<RestaurantWithDistance[]> {
    const radiusKm = dto.radiusKm ?? 5;
    const limit = dto.limit ?? 10;

    const all = await this.restaurantRepository.find({
      where: dto.onlyOpen ? { isOpen: true } : {},
    });

    return all
      .map((r) => {
        const distanceKm =
          Math.round(
            haversineKm(
              dto.lat,
              dto.lng,
              Number(r.latitude),
              Number(r.longitude),
            ) * 10,
          ) / 10;
        return {
          ...r,
          distanceKm,
          adjustedDeliveryMinutes:
            r.estimatedDeliveryMinutes + Math.ceil(distanceKm * 2),
        } as RestaurantWithDistance;
      })
      .filter((r) => r.distanceKm! <= radiusKm)
      .sort((a, b) => a.distanceKm! - b.distanceKm!)
      .slice(0, limit);
  }

  async findByDeliveryTime(
    lat?: number,
    lng?: number,
    limit = 10,
  ): Promise<RestaurantWithDistance[]> {
    const all = await this.restaurantRepository.find({
      where: { isOpen: true },
    });
    const hasCoords = lat !== undefined && lng !== undefined;

    return all
      .map((r) => {
        const distanceKm = hasCoords
          ? Math.round(
              haversineKm(lat!, lng!, Number(r.latitude), Number(r.longitude)) *
                10,
            ) / 10
          : undefined;
        const adjustedDeliveryMinutes =
          distanceKm !== undefined
            ? r.estimatedDeliveryMinutes + Math.ceil(distanceKm * 2)
            : r.estimatedDeliveryMinutes;
        return {
          ...r,
          distanceKm,
          adjustedDeliveryMinutes,
        } as RestaurantWithDistance;
      })
      .sort(
        (a, b) =>
          (a.adjustedDeliveryMinutes ?? a.estimatedDeliveryMinutes) -
          (b.adjustedDeliveryMinutes ?? b.estimatedDeliveryMinutes),
      )
      .slice(0, limit);
  }

  // ── Avaliações ──────────────────────────────────────────────────────────────

  async createReview(
    restaurantId: string,
    customerId: string,
    dto: CreateReviewDto,
  ): Promise<RestaurantReview> {
    const order = await this.orderRepository.findOne({
      where: { id: dto.orderId, customerId, restaurantId },
    });
    if (!order)
      throw new NotFoundException(
        'Pedido não encontrado ou não pertence a você',
      );
    if (order.status !== OrderStatus.DELIVERED)
      throw new BadRequestException('Só é possível avaliar pedidos entregues');

    const existing = await this.reviewRepository.findOne({
      where: { customerId, orderId: dto.orderId },
    });
    if (existing) throw new ConflictException('Você já avaliou este pedido');

    const review = this.reviewRepository.create({
      restaurantId,
      customerId,
      orderId: dto.orderId,
      rating: dto.rating,
      comment: dto.comment ?? null,
    });
    const saved = await this.reviewRepository.save(review);

    // Atualiza média e total atomicamente
    await this.restaurantRepository
      .createQueryBuilder()
      .update()
      .set({
        averageRating: () =>
          `(SELECT ROUND(AVG(rating)::numeric, 2) FROM restaurant_reviews WHERE "restaurantId" = '${restaurantId}')`,
        totalReviews: () =>
          `(SELECT COUNT(*) FROM restaurant_reviews WHERE "restaurantId" = '${restaurantId}')`,
      })
      .where('id = :id', { id: restaurantId })
      .execute();

    return saved;
  }

  async findReviews(
    restaurantId: string,
    dto: PaginatedReviewsDto,
  ): Promise<PaginatedResult<RestaurantReview>> {
    await this.findOne(restaurantId);
    const qb = this.reviewRepository
      .createQueryBuilder('rv')
      .leftJoinAndSelect('rv.customer', 'customer')
      .where('rv.restaurantId = :restaurantId', { restaurantId })
      .orderBy('rv.createdAt', 'DESC');

    if (dto.minRating)
      qb.andWhere('rv.rating >= :minRating', { minRating: dto.minRating });

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Métodos de pagamento ────────────────────────────────────────────────────

  async findPaymentMethods(restaurantId: string): Promise<PaymentMethod[]> {
    const restaurant = await this.restaurantRepository.findOne({
      where: { id: restaurantId },
      relations: ['acceptedPaymentMethods'],
    });
    if (!restaurant)
      throw new NotFoundException(`Restaurant "${restaurantId}" not found`);
    return restaurant.acceptedPaymentMethods;
  }

  async updatePaymentMethods(
    restaurantId: string,
    ownerId: string,
    dto: UpdatePaymentMethodsDto,
  ): Promise<PaymentMethod[]> {
    const restaurant = await this.restaurantRepository.findOne({
      where: { id: restaurantId },
      relations: ['acceptedPaymentMethods'],
    });
    if (!restaurant)
      throw new NotFoundException(`Restaurant "${restaurantId}" not found`);
    if (restaurant.ownerId !== ownerId) throw new ForbiddenException();

    const methods = await this.paymentMethodRepository.findBy({
      id: In(dto.paymentMethodIds),
      isActive: true,
    });
    if (methods.length !== dto.paymentMethodIds.length)
      throw new BadRequestException(
        'Um ou mais métodos de pagamento são inválidos ou inativos',
      );

    restaurant.acceptedPaymentMethods = methods;
    await this.restaurantRepository.save(restaurant);
    return methods;
  }

  // ── Upload de imagem ────────────────────────────────────────────────────────

  async uploadImage(
    restaurantId: string,
    ownerId: string,
    field: 'logo' | 'banner',
    file: Express.Multer.File,
  ): Promise<{ url: string }> {
    validateImageFile(file);
    const restaurant = await this.restaurantRepository.findOne({
      where: { id: restaurantId },
    });
    if (!restaurant)
      throw new NotFoundException(`Restaurant "${restaurantId}" not found`);
    if (restaurant.ownerId !== ownerId) throw new ForbiddenException();

    const filename = `restaurants/${restaurantId}/${field}-${uuidv4()}${extname(file.originalname).toLowerCase()}`;
    const url = await this.storageService.upload(
      file.buffer,
      file.mimetype,
      filename,
    );

    const previousUrl =
      field === 'logo' ? restaurant.logoUrl : restaurant.bannerUrl;
    if (previousUrl) {
      await this.storageService.delete(previousUrl).catch(() => {
        /* ignora falhas de limpeza */
      });
    }

    if (field === 'logo') restaurant.logoUrl = url;
    else restaurant.bannerUrl = url;

    await this.restaurantRepository.save(restaurant);
    return { url };
  }

  // ── Favoritos ───────────────────────────────────────────────────────────────

  async toggleFavorite(
    restaurantId: string,
    userId: string,
  ): Promise<{ favorited: boolean }> {
    await this.findOne(restaurantId);
    const existing = await this.favoriteRepository.findOne({
      where: { restaurantId, userId },
    });
    if (existing) {
      await this.favoriteRepository.remove(existing);
      return { favorited: false };
    }
    await this.favoriteRepository.save(
      this.favoriteRepository.create({ restaurantId, userId }),
    );
    return { favorited: true };
  }

  async findFavorites(userId: string): Promise<Restaurant[]> {
    const favs = await this.favoriteRepository.find({
      where: { userId },
      relations: ['restaurant'],
      order: { createdAt: 'DESC' },
    });
    return favs.map((f) => f.restaurant);
  }

  async isFavorited(
    restaurantId: string,
    userId: string,
  ): Promise<{ favorited: boolean }> {
    const exists = await this.favoriteRepository.findOne({
      where: { restaurantId, userId },
    });
    return { favorited: !!exists };
  }

  // ── Taxa de entrega (admin) ─────────────────────────────────────────────────

  async setDeliveryFee(
    restaurantId: string,
    dto: SetDeliveryFeeDto,
  ): Promise<Restaurant> {
    const restaurant = await this.findOne(restaurantId);
    restaurant.deliveryFee = dto.isFreeDelivery ? 0 : dto.deliveryFee;
    return this.restaurantRepository.save(restaurant);
  }
}
