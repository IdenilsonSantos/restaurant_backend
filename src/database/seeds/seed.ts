import { AppDataSource } from '../../config/data-source';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../../modules/user/entities/user.entity';
import { Restaurant } from '../../modules/restaurant/entities/restaurant.entity';
import { Product } from '../../modules/restaurant/entities/product.entity';
import { Driver } from '../../modules/driver/entities/driver.entity';

async function seed() {
  await AppDataSource.initialize();
  console.log('Connected to database');

  const userRepo = AppDataSource.getRepository(User);
  const restaurantRepo = AppDataSource.getRepository(Restaurant);
  const productRepo = AppDataSource.getRepository(Product);
  const driverRepo = AppDataSource.getRepository(Driver);

  const passwordHash = await bcrypt.hash('password123', 10);

  // ── Users ──────────────────────────────────────────────────────────────────

  const [admin, owner, customer1, customer2, driverUser1, driverUser2] =
    await userRepo.save([
      userRepo.create({ name: 'Admin', email: 'admin@delivery.com', passwordHash, phone: '11900000000', role: UserRole.ADMIN }),
      userRepo.create({ name: 'João Restaurante', email: 'owner@delivery.com', passwordHash, phone: '11911111111', role: UserRole.RESTAURANT_OWNER }),
      userRepo.create({ name: 'Maria Cliente', email: 'maria@delivery.com', passwordHash, phone: '11922222222', role: UserRole.CUSTOMER }),
      userRepo.create({ name: 'Carlos Cliente', email: 'carlos@delivery.com', passwordHash, phone: '11933333333', role: UserRole.CUSTOMER }),
      userRepo.create({ name: 'Ana Entregadora', email: 'ana@delivery.com', passwordHash, phone: '11944444444', role: UserRole.DRIVER }),
      userRepo.create({ name: 'Pedro Entregador', email: 'pedro@delivery.com', passwordHash, phone: '11955555555', role: UserRole.DRIVER }),
    ]);

  console.log('Users created');

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
      longitude: -46.6600,
      isOpen: true,
    }),
  ]);

  console.log('Restaurants created');

  // ── Products ───────────────────────────────────────────────────────────────

  await productRepo.save([
    // Burger House
    productRepo.create({ restaurantId: burger.id, name: 'X-Burguer Clássico', description: 'Pão brioche, 180g de carne, queijo, alface, tomate', price: 28.90, isAvailable: true }),
    productRepo.create({ restaurantId: burger.id, name: 'X-Bacon Duplo', description: 'Dois blends, bacon crocante, queijo cheddar, molho especial', price: 39.90, isAvailable: true }),
    productRepo.create({ restaurantId: burger.id, name: 'Veggie Burger', description: 'Blend de grão-de-bico, rúcula, tomate seco, queijo brie', price: 32.90, isAvailable: true }),
    productRepo.create({ restaurantId: burger.id, name: 'Batata Frita', description: 'Porção de 300g com maionese temperada', price: 18.00, isAvailable: true }),
    productRepo.create({ restaurantId: burger.id, name: 'Milk Shake Chocolate', description: '400ml cremoso', price: 22.00, isAvailable: true }),
    // Pizza Express
    productRepo.create({ restaurantId: pizza.id, name: 'Pizza Margherita', description: 'Molho de tomate, mussarela, manjericão fresco', price: 45.00, isAvailable: true }),
    productRepo.create({ restaurantId: pizza.id, name: 'Pizza Calabresa', description: 'Calabresa fatiada, cebola roxa, azeitona', price: 49.00, isAvailable: true }),
    productRepo.create({ restaurantId: pizza.id, name: 'Pizza Quatro Queijos', description: 'Mussarela, catupiry, gorgonzola, parmesão', price: 55.00, isAvailable: true }),
    productRepo.create({ restaurantId: pizza.id, name: 'Calzone Frango', description: 'Frango desfiado, catupiry, milho', price: 42.00, isAvailable: true }),
    productRepo.create({ restaurantId: pizza.id, name: 'Refrigerante 2L', description: 'Coca-Cola, Guaraná ou Sprite', price: 12.00, isAvailable: true }),
  ]);

  console.log('Products created');

  // ── Drivers ────────────────────────────────────────────────────────────────

  await driverRepo.save([
    driverRepo.create({
      userId: driverUser1.id,
      vehicleType: 'moto',
      licensePlate: 'ABC-1234',
      rating: 4.8,
      isAvailable: true,
      currentLatitude: -23.5605,
      currentLongitude: -46.6566,
    }),
    driverRepo.create({
      userId: driverUser2.id,
      vehicleType: 'bicicleta',
      licensePlate: 'XYZ-5678',
      rating: 4.5,
      isAvailable: true,
      currentLatitude: -23.5580,
      currentLongitude: -46.6590,
    }),
  ]);

  console.log('Drivers created');

  await AppDataSource.destroy();

  console.log('\n✓ Seed concluído! Credenciais de teste:');
  console.log('  admin@delivery.com       | password123 | role: admin');
  console.log('  owner@delivery.com       | password123 | role: restaurant_owner');
  console.log('  maria@delivery.com       | password123 | role: customer');
  console.log('  carlos@delivery.com      | password123 | role: customer');
  console.log('  ana@delivery.com         | password123 | role: driver');
  console.log('  pedro@delivery.com       | password123 | role: driver');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
