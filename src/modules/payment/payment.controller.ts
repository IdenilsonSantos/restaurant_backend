import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentMethodService } from './payment-method.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly paymentMethodService: PaymentMethodService,
  ) {}

  @Get('methods')
  listMethods() {
    return this.paymentMethodService.findAll();
  }

  @Post()
  @Roles('customer')
  initiate(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentService.initiate(user.id, dto);
  }

  @Post(':id/confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmPaymentDto,
  ) {
    return this.paymentService.confirm(id, dto);
  }

  @Post(':id/fail')
  fail(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentService.fail(id);
  }

  @Get('order/:orderId')
  findByOrder(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.paymentService.findByOrder(orderId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentService.findOne(id);
  }
}
