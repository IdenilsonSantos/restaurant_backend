import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NearbyRestaurantDto } from './dto/nearby-restaurant.dto';
import { SearchRestaurantDto } from './dto/search-restaurant.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { PaginatedReviewsDto } from './dto/paginated-reviews.dto';
import { UpdatePaymentMethodsDto } from './dto/update-payment-methods.dto';
import { SetDeliveryFeeDto } from './dto/set-delivery-fee.dto';

@Controller('restaurants')
export class RestaurantController {
  constructor(private readonly restaurantService: RestaurantService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('restaurant_owner')
  @Post()
  create(@Body() dto: CreateRestaurantDto) {
    return this.restaurantService.create(dto);
  }

  @Get()
  findAll(@Query() pagination: PaginationDto) {
    return this.restaurantService.findAll(pagination.page, pagination.limit);
  }

  // ── Rotas literais antes de :id para evitar conflito ──────────────────────

  @Get('search')
  search(@Query() dto: SearchRestaurantDto) {
    return this.restaurantService.search(dto);
  }

  @Get('featured')
  findFeatured() {
    return this.restaurantService.findFeatured();
  }

  /**
   * Restaurantes próximos ao cliente.
   * GET /restaurants/nearby?lat=-23.56&lng=-46.65&radiusKm=5&onlyOpen=true&limit=10
   */
  @Get('nearby')
  findNearby(@Query() dto: NearbyRestaurantDto) {
    return this.restaurantService.findNearby(dto);
  }

  @Get('fastest')
  findByDeliveryTime(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('limit') limit?: string,
  ) {
    return this.restaurantService.findByDeliveryTime(
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  // ── Favoritos (literal antes de :id) ───────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  @Get('favorites/my')
  getMyFavorites(@CurrentUser() user: any) {
    return this.restaurantService.findFavorites(user.id);
  }

  // ── Rotas com :id ─────────────────────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.restaurantService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('restaurant_owner')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRestaurantDto,
  ) {
    return this.restaurantService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id/delivery-fee')
  setDeliveryFee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDeliveryFeeDto,
  ) {
    return this.restaurantService.setDeliveryFee(id, dto);
  }

  // Toggle favorito (customer)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  @Post(':id/favorite')
  toggleFavorite(
    @Param('id', ParseUUIDPipe) restaurantId: string,
    @CurrentUser() user: any,
  ) {
    return this.restaurantService.toggleFavorite(restaurantId, user.id);
  }

  // Verificar se está favoritado
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  @Get(':id/favorite')
  isFavorited(
    @Param('id', ParseUUIDPipe) restaurantId: string,
    @CurrentUser() user: any,
  ) {
    return this.restaurantService.isFavorited(restaurantId, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('restaurant_owner')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.restaurantService.remove(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('restaurant_owner')
  @Post(':id/products')
  createProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProductDto,
  ) {
    dto.restaurantId = id;
    return this.restaurantService.createProduct(dto);
  }

  @Get(':id/products')
  findProducts(@Param('id', ParseUUIDPipe) id: string) {
    return this.restaurantService.findProducts(id);
  }

  // ── Avaliações ──────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  @Post(':id/reviews')
  createReview(
    @Param('id', ParseUUIDPipe) restaurantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateReviewDto,
  ) {
    return this.restaurantService.createReview(restaurantId, user.id, dto);
  }

  @Get(':id/reviews')
  findReviews(
    @Param('id', ParseUUIDPipe) restaurantId: string,
    @Query() dto: PaginatedReviewsDto,
  ) {
    return this.restaurantService.findReviews(restaurantId, dto);
  }

  // ── Métodos de pagamento ────────────────────────────────────────────────────

  @Get(':id/payment-methods')
  findPaymentMethods(@Param('id', ParseUUIDPipe) id: string) {
    return this.restaurantService.findPaymentMethods(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('restaurant_owner')
  @Put(':id/payment-methods')
  updatePaymentMethods(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdatePaymentMethodsDto,
  ) {
    return this.restaurantService.updatePaymentMethods(id, user.id, dto);
  }
}
