import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum PaymentMethodCode {
  PIX = 'pix',
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  CASH = 'cash',
  FOOD_VOUCHER = 'food_voucher',
  MEAL_VOUCHER = 'meal_voucher',
  BOLETO = 'boleto',
  CRYPTO = 'crypto',
}

export const DEFAULT_PAYMENT_METHODS: Array<{
  code: PaymentMethodCode;
  name: string;
  isActive: boolean;
}> = [
  { code: PaymentMethodCode.PIX, name: 'PIX', isActive: true },
  {
    code: PaymentMethodCode.CREDIT_CARD,
    name: 'Cartão de Crédito',
    isActive: true,
  },
  {
    code: PaymentMethodCode.DEBIT_CARD,
    name: 'Cartão de Débito',
    isActive: true,
  },
  { code: PaymentMethodCode.CASH, name: 'Dinheiro na Entrega', isActive: true },
  {
    code: PaymentMethodCode.FOOD_VOUCHER,
    name: 'Vale-Refeição',
    isActive: true,
  },
  {
    code: PaymentMethodCode.MEAL_VOUCHER,
    name: 'Vale-Alimentação',
    isActive: true,
  },
  { code: PaymentMethodCode.BOLETO, name: 'Boleto Bancário', isActive: true },
  { code: PaymentMethodCode.CRYPTO, name: 'Criptomoeda', isActive: false },
];

@Entity('payment_methods')
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'enum', enum: PaymentMethodCode, unique: true })
  code!: PaymentMethodCode;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
