import { AppDataSource } from '../../config/data-source';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../../modules/user/entities/user.entity';
import { Restaurant } from '../../modules/restaurant/entities/restaurant.entity';
import { Product } from '../../modules/restaurant/entities/product.entity';
import { Driver } from '../../modules/driver/entities/driver.entity';
import { Order } from '../../modules/order/entities/order.entity';
import { OrderItem } from '../../modules/order/entities/order-item.entity';
import { Delivery } from '../../modules/delivery/entities/delivery.entity';
import { Payment } from '../../modules/payment/entities/payment.entity';
import {
  PaymentMethod,
  PaymentMethodCode,
} from '../../modules/payment/entities/payment-method.entity';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { DeliveryStatus } from '../../common/enums/delivery-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var for seed: ${key}`);
  return value;
}

async function seed() {
  const adminPassword = requireEnv('SEED_ADMIN_PASSWORD');
  const ownerPassword = requireEnv('SEED_OWNER_PASSWORD');
  const customerPassword = requireEnv('SEED_CUSTOMER_PASSWORD');
  const driverPassword = requireEnv('SEED_DRIVER_PASSWORD');

  await AppDataSource.initialize();
  console.log('Connected to database');

  await AppDataSource.query(
    'TRUNCATE TABLE deliveries, payments, order_items, orders, drivers, products, restaurants, users RESTART IDENTITY CASCADE',
  );
  console.log('Tables truncated');

  const userRepo = AppDataSource.getRepository(User);
  const restaurantRepo = AppDataSource.getRepository(Restaurant);
  const productRepo = AppDataSource.getRepository(Product);
  const driverRepo = AppDataSource.getRepository(Driver);
  const orderRepo = AppDataSource.getRepository(Order);
  const itemRepo = AppDataSource.getRepository(OrderItem);
  const deliveryRepo = AppDataSource.getRepository(Delivery);
  const paymentRepo = AppDataSource.getRepository(Payment);
  const paymentMethodRepo = AppDataSource.getRepository(PaymentMethod);

  const [pixMethod, creditCardMethod] = await Promise.all([
    paymentMethodRepo.findOneByOrFail({ code: PaymentMethodCode.PIX }),
    paymentMethodRepo.findOneByOrFail({ code: PaymentMethodCode.CREDIT_CARD }),
  ]);

  // ── Users ──────────────────────────────────────────────────────────────────

  const [, owner, maria, carlos, driverUser1, driverUser2] =
    await userRepo.save([
      userRepo.create({
        name: 'Admin',
        email: 'admin@delivery.com',
        passwordHash: await bcrypt.hash(adminPassword, 10),
        phone: '11900000000',
        role: UserRole.ADMIN,
      }),
      userRepo.create({
        name: 'João Restaurante',
        email: 'owner@delivery.com',
        passwordHash: await bcrypt.hash(ownerPassword, 10),
        phone: '11911111111',
        role: UserRole.RESTAURANT_OWNER,
      }),
      userRepo.create({
        name: 'Maria Cliente',
        email: 'maria@delivery.com',
        passwordHash: await bcrypt.hash(customerPassword, 10),
        phone: '11922222222',
        role: UserRole.CUSTOMER,
      }),
      userRepo.create({
        name: 'Carlos Cliente',
        email: 'carlos@delivery.com',
        passwordHash: await bcrypt.hash(customerPassword, 10),
        phone: '11933333333',
        role: UserRole.CUSTOMER,
      }),
      userRepo.create({
        name: 'Ana Entregadora',
        email: 'ana@delivery.com',
        passwordHash: await bcrypt.hash(driverPassword, 10),
        phone: '11944444444',
        role: UserRole.DRIVER,
      }),
      userRepo.create({
        name: 'Pedro Entregador',
        email: 'pedro@delivery.com',
        passwordHash: await bcrypt.hash(driverPassword, 10),
        phone: '11955555555',
        role: UserRole.DRIVER,
      }),
    ]);
  console.log('Users seeded');

  // ── Restaurants ────────────────────────────────────────────────────────────

  const [burger, pizza] = await restaurantRepo.save([
    restaurantRepo.create({
      ownerId: owner.id,
      name: 'Burger House',
      description: 'Os melhores hambúrgueres artesanais da cidade',
      address: 'Av. Paulista, 1000 - São Paulo, SP',
      latitude: -23.5631,
      longitude: -46.6544,
      isOpen: true,
    }),
    restaurantRepo.create({
      ownerId: owner.id,
      name: 'Pizza Express',
      description: 'Pizzas no forno a lenha, entrega em 30 minutos',
      address: 'Rua Augusta, 500 - São Paulo, SP',
      latitude: -23.5551,
      longitude: -46.66,
      isOpen: true,
    }),
  ]);
  console.log('Restaurants seeded');

  // ── Products ───────────────────────────────────────────────────────────────

  const [
    xBurguer,
    ,
    ,
    batata,
    ,
    margherita,
    calabresa,
    quatroQueijos,
    ,
    refri,
  ] = await productRepo.save([
    productRepo.create({
      restaurantId: burger.id,
      name: 'X-Burguer Clássico',
      description: 'Pão brioche, 180g de carne, queijo, alface, tomate',
      price: 28.9,
      isAvailable: true,
    }),
    productRepo.create({
      restaurantId: burger.id,
      name: 'X-Bacon Duplo',
      description:
        'Dois blends, bacon crocante, queijo cheddar, molho especial',
      price: 39.9,
      isAvailable: true,
    }),
    productRepo.create({
      restaurantId: burger.id,
      name: 'Veggie Burger',
      description: 'Blend de grão-de-bico, rúcula, tomate seco, queijo brie',
      price: 32.9,
      isAvailable: true,
    }),
    productRepo.create({
      restaurantId: burger.id,
      name: 'Batata Frita',
      description: 'Porção de 300g com maionese temperada',
      price: 18.0,
      isAvailable: true,
    }),
    productRepo.create({
      restaurantId: burger.id,
      name: 'Milk Shake Chocolate',
      description: '400ml cremoso',
      price: 22.0,
      isAvailable: true,
    }),
    productRepo.create({
      restaurantId: pizza.id,
      name: 'Pizza Margherita',
      description: 'Molho de tomate, mussarela, manjericão fresco',
      price: 45.0,
      isAvailable: true,
    }),
    productRepo.create({
      restaurantId: pizza.id,
      name: 'Pizza Calabresa',
      description: 'Calabresa fatiada, cebola roxa, azeitona',
      price: 49.0,
      isAvailable: true,
    }),
    productRepo.create({
      restaurantId: pizza.id,
      name: 'Pizza Quatro Queijos',
      description: 'Mussarela, catupiry, gorgonzola, parmesão',
      price: 55.0,
      isAvailable: true,
    }),
    productRepo.create({
      restaurantId: pizza.id,
      name: 'Calzone Frango',
      description: 'Frango desfiado, catupiry, milho',
      price: 42.0,
      isAvailable: true,
    }),
    productRepo.create({
      restaurantId: pizza.id,
      name: 'Refrigerante 2L',
      description: 'Coca-Cola, Guaraná ou Sprite',
      price: 12.0,
      isAvailable: true,
    }),
  ]);
  console.log('Products seeded');

  // ── Drivers ────────────────────────────────────────────────────────────────

  const [ana] = await driverRepo.save([
    driverRepo.create({
      userId: driverUser1.id,
      vehicleType: 'moto',
      licensePlate: 'ABC-1234',
      rating: 4.8,
      isAvailable: false,
      currentLatitude: -23.5605,
      currentLongitude: -46.6566,
    }),
    driverRepo.create({
      userId: driverUser2.id,
      vehicleType: 'bicicleta',
      licensePlate: 'XYZ-5678',
      rating: 4.5,
      isAvailable: true,
      currentLatitude: -23.558,
      currentLongitude: -46.659,
    }),
  ]);
  console.log('Drivers seeded');

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Pedido 1: Maria → Burger House — entregue (fluxo completo)
  // Pedido 2: Carlos → Pizza Express — em preparo
  // Pedido 3: Maria → Pizza Express — pendente (recém criado)

  const order1Total = xBurguer.price * 2 + batata.price * 1;
  const order2Total = margherita.price * 1 + refri.price * 2;
  const order3Total = calabresa.price * 1 + quatroQueijos.price * 1;

  const [order1, order2, order3] = await orderRepo.save([
    orderRepo.create({
      customerId: maria.id,
      restaurantId: burger.id,
      status: OrderStatus.DELIVERED,
      totalAmount: order1Total,
      deliveryAddress: 'Rua das Flores, 123 - Vila Madalena, SP',
      deliveryLatitude: -23.5489,
      deliveryLongitude: -46.6897,
      notes: 'Sem cebola no burguer',
    }),
    orderRepo.create({
      customerId: carlos.id,
      restaurantId: pizza.id,
      status: OrderStatus.PREPARING,
      totalAmount: order2Total,
      deliveryAddress: 'Al. Santos, 800 - Jardins, SP',
      deliveryLatitude: -23.5629,
      deliveryLongitude: -46.6544,
      notes: null,
    }),
    orderRepo.create({
      customerId: maria.id,
      restaurantId: pizza.id,
      status: OrderStatus.PENDING,
      totalAmount: order3Total,
      deliveryAddress: 'Rua das Flores, 123 - Vila Madalena, SP',
      deliveryLatitude: -23.5489,
      deliveryLongitude: -46.6897,
      notes: 'Borda recheada no calabresa',
    }),
  ]);
  console.log('Orders seeded');

  // ── Order Items ────────────────────────────────────────────────────────────

  await itemRepo.save([
    // Pedido 1
    itemRepo.create({
      orderId: order1.id,
      productId: xBurguer.id,
      productName: xBurguer.name,
      productPrice: xBurguer.price,
      quantity: 2,
      subtotal: xBurguer.price * 2,
    }),
    itemRepo.create({
      orderId: order1.id,
      productId: batata.id,
      productName: batata.name,
      productPrice: batata.price,
      quantity: 1,
      subtotal: batata.price * 1,
    }),
    // Pedido 2
    itemRepo.create({
      orderId: order2.id,
      productId: margherita.id,
      productName: margherita.name,
      productPrice: margherita.price,
      quantity: 1,
      subtotal: margherita.price * 1,
    }),
    itemRepo.create({
      orderId: order2.id,
      productId: refri.id,
      productName: refri.name,
      productPrice: refri.price,
      quantity: 2,
      subtotal: refri.price * 2,
    }),
    // Pedido 3
    itemRepo.create({
      orderId: order3.id,
      productId: calabresa.id,
      productName: calabresa.name,
      productPrice: calabresa.price,
      quantity: 1,
      subtotal: calabresa.price * 1,
    }),
    itemRepo.create({
      orderId: order3.id,
      productId: quatroQueijos.id,
      productName: quatroQueijos.name,
      productPrice: quatroQueijos.price,
      quantity: 1,
      subtotal: quatroQueijos.price * 1,
    }),
  ]);
  console.log('Order Items seeded');

  // ── Payments ───────────────────────────────────────────────────────────────

  const now = new Date();

  await paymentRepo.save([
    paymentRepo.create({
      orderId: order1.id,
      amount: order1Total,
      status: PaymentStatus.CONFIRMED,
      paymentMethodId: creditCardMethod.id,
      externalId: 'ext_001',
      confirmedAt: now,
    }),
    paymentRepo.create({
      orderId: order2.id,
      amount: order2Total,
      status: PaymentStatus.CONFIRMED,
      paymentMethodId: pixMethod.id,
      externalId: 'ext_002',
      confirmedAt: now,
    }),
    paymentRepo.create({
      orderId: order3.id,
      amount: order3Total,
      status: PaymentStatus.PENDING,
      paymentMethodId: creditCardMethod.id,
      externalId: null,
      confirmedAt: null,
    }),
  ]);
  console.log('Payments seeded');

  // ── Deliveries ─────────────────────────────────────────────────────────────

  const pickedUp = new Date(now.getTime() - 30 * 60_000);
  const delivered = new Date(now.getTime() - 10 * 60_000);

  await deliveryRepo.save([
    // Pedido 1 — entrega concluída pela Ana
    deliveryRepo.create({
      orderId: order1.id,
      driverId: ana.id,
      status: DeliveryStatus.DELIVERED,
      pickedUpAt: pickedUp,
      deliveredAt: delivered,
    }),
    // Pedido 2 — aguardando entregador (em preparo ainda)
    deliveryRepo.create({
      orderId: order2.id,
      driverId: null,
      status: DeliveryStatus.WAITING,
      pickedUpAt: null,
      deliveredAt: null,
    }),
  ]);
  console.log('Deliveries seeded');

  await AppDataSource.destroy();

  console.log('\nSeed completo! Resumo:');
  console.log('  Usuários        : 6 (admin, owner, 2 customers, 2 drivers)');
  console.log('  Restaurantes    : 2 (Burger House, Pizza Express)');
  console.log('  Produtos        : 10');
  console.log('  Pedidos         : 3 (delivered / preparing / pending)');
  console.log('  Itens           : 6');
  console.log('  Métodos pag.    : 8 (seeded via migration)');
  console.log('  Pagamentos      : 3 (confirmed / confirmed / pending)');
  console.log('  Entregas        : 2 (delivered / waiting)');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
