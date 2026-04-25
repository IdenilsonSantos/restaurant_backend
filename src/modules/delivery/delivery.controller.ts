import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  /**
   * POST /api/v1/deliveries
   * Restaurant owner triggers a delivery for a confirmed/ready order.
   */
  @Post()
  @Roles('restaurant_owner')
  create(@Body() dto: CreateDeliveryDto) {
    return this.deliveryService.create(dto);
  }

  /**
   * GET /api/v1/deliveries/driver/my
   * Returns the authenticated driver's delivery history (paginated).
   * NOTE: must be declared BEFORE :id to avoid route shadowing.
   */
  @Get('driver/my')
  @Roles('driver')
  findByDriver(
    @CurrentUser() user: { id: string; role: string },
    @Query() query: PaginationDto,
  ) {
    return this.deliveryService.findByDriver(user.id, query.page, query.limit);
  }

  /**
   * GET /api/v1/deliveries/order/:orderId
   * Returns the delivery associated with a specific order.
   */
  @Get('order/:orderId')
  findByOrder(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.deliveryService.findByOrder(orderId);
  }

  /**
   * GET /api/v1/deliveries/:id
   * Returns a single delivery by id (any authenticated user).
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.deliveryService.findOne(id);
  }

  /**
   * PATCH /api/v1/deliveries/:id/status
   * Driver updates the status of their own delivery.
   */
  @Patch(':id/status')
  @Roles('driver')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryStatusDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.deliveryService.updateStatus(id, dto, user.id);
  }
}
