import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { IsEnum, IsOptional } from 'class-validator';

class RestaurantOrdersQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @Roles('customer')
  create(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: CreateOrderDto,
  ) {
    return this.orderService.create(user.id, dto);
  }

  @Get('my')
  @Roles('customer')
  findByCustomer(
    @CurrentUser() user: { id: string; role: string },
    @Query() query: PaginationDto,
  ) {
    return this.orderService.findByCustomer(user.id, query.page, query.limit);
  }

  @Get('restaurant/:id')
  @Roles('restaurant_owner')
  findByRestaurant(
    @Param('id', ParseUUIDPipe) restaurantId: string,
    @Query() query: RestaurantOrdersQueryDto,
  ) {
    return this.orderService.findByRestaurant(
      restaurantId,
      query.page,
      query.limit,
      query.status,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orderService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.orderService.updateStatus(id, dto, user.id, user.role);
  }

  @Delete(':id')
  @Roles('customer')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.orderService.cancel(id, user.id);
  }
}
