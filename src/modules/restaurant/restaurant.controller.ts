import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('restaurants')
export class RestaurantController {
  constructor(private readonly restaurantService: RestaurantService) {}

  @Post()
  create(@Body() dto: CreateRestaurantDto) {
    return this.restaurantService.create(dto);
  }

  @Get()
  findAll(@Query() pagination: PaginationDto) {
    return this.restaurantService.findAll(pagination.page, pagination.limit);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.restaurantService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRestaurantDto,
  ) {
    return this.restaurantService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.restaurantService.remove(id);
  }

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
}
