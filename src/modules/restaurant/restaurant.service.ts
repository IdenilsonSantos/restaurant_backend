import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Restaurant } from './entities/restaurant.entity';
import { Product } from './entities/product.entity';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';

@Injectable()
export class RestaurantService {
  constructor(
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
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
}
