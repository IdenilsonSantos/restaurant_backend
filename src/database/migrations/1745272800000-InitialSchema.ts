import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1745272800000 implements MigrationInterface {
  name = 'InitialSchema1745272800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ENUMs
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('customer', 'restaurant_owner', 'driver', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."deliveries_status_enum" AS ENUM('waiting', 'assigned', 'picked_up', 'delivered', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'confirmed', 'failed', 'refunded')`,
    );

    // Table: users
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "name"          character varying NOT NULL,
        "email"         character varying NOT NULL,
        "passwordHash"  character varying NOT NULL,
        "phone"         character varying NOT NULL,
        "role"          "public"."users_role_enum" NOT NULL DEFAULT 'customer',
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users_id"   PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email")`);

    // Table: restaurants
    await queryRunner.query(`
      CREATE TABLE "restaurants" (
        "id"          uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "ownerId"     uuid              NOT NULL,
        "name"        character varying NOT NULL,
        "description" text              NOT NULL,
        "address"     character varying NOT NULL,
        "latitude"    numeric(10,7)     NOT NULL,
        "longitude"   numeric(10,7)     NOT NULL,
        "isOpen"      boolean           NOT NULL DEFAULT false,
        "createdAt"   TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_restaurants_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_restaurants_owner" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_restaurants_name" ON "restaurants" ("name")`);

    // Table: products
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id"           uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "restaurantId" uuid              NOT NULL,
        "name"         character varying NOT NULL,
        "description"  text              NOT NULL,
        "price"        numeric(10,2)     NOT NULL,
        "imageUrl"     character varying,
        "isAvailable"  boolean           NOT NULL DEFAULT true,
        "createdAt"    TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_restaurant" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_products_restaurantId" ON "products" ("restaurantId")`);

    // Table: drivers
    await queryRunner.query(`
      CREATE TABLE "drivers" (
        "id"               uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "userId"           uuid          NOT NULL,
        "vehicleType"      character varying NOT NULL,
        "licensePlate"     character varying NOT NULL,
        "rating"           numeric(3,2)  NOT NULL DEFAULT 5.0,
        "isAvailable"      boolean       NOT NULL DEFAULT false,
        "currentLatitude"  numeric(10,7),
        "currentLongitude" numeric(10,7),
        "createdAt"        TIMESTAMP     NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_drivers_userId" UNIQUE ("userId"),
        CONSTRAINT "PK_drivers_id"     PRIMARY KEY ("id"),
        CONSTRAINT "FK_drivers_user"   FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_drivers_isAvailable" ON "drivers" ("isAvailable")`);

    // Table: orders
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id"                uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "customerId"        uuid              NOT NULL,
        "restaurantId"      uuid              NOT NULL,
        "status"            "public"."orders_status_enum" NOT NULL DEFAULT 'pending',
        "totalAmount"       numeric(10,2)     NOT NULL,
        "deliveryAddress"   character varying NOT NULL,
        "deliveryLatitude"  numeric(10,7)     NOT NULL,
        "deliveryLongitude" numeric(10,7)     NOT NULL,
        "notes"             text,
        "createdAt"         TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_orders_customer"   FOREIGN KEY ("customerId")   REFERENCES "users"("id")        ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_orders_restaurant" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")  ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_orders_customerId"   ON "orders" ("customerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_restaurantId" ON "orders" ("restaurantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_status"       ON "orders" ("status")`);

    // Table: order_items
    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id"           uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "orderId"      uuid          NOT NULL,
        "productId"    uuid          NOT NULL,
        "productName"  character varying NOT NULL,
        "productPrice" numeric(10,2) NOT NULL,
        "quantity"     integer       NOT NULL,
        "subtotal"     numeric(10,2) NOT NULL,
        CONSTRAINT "PK_order_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_items_order"   FOREIGN KEY ("orderId")   REFERENCES "orders"("id")   ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_order_items_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_order_items_orderId" ON "order_items" ("orderId")`);

    // Table: deliveries
    await queryRunner.query(`
      CREATE TABLE "deliveries" (
        "id"          uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "orderId"     uuid          NOT NULL,
        "driverId"    uuid,
        "status"      "public"."deliveries_status_enum" NOT NULL DEFAULT 'waiting',
        "pickedUpAt"  TIMESTAMP,
        "deliveredAt" TIMESTAMP,
        "createdAt"   TIMESTAMP     NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_deliveries_orderId"  UNIQUE ("orderId"),
        CONSTRAINT "PK_deliveries_id"       PRIMARY KEY ("id"),
        CONSTRAINT "FK_deliveries_order"    FOREIGN KEY ("orderId")  REFERENCES "orders"("id")  ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_deliveries_driver"   FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_deliveries_driverId" ON "deliveries" ("driverId")`);
    await queryRunner.query(`CREATE INDEX "IDX_deliveries_status"   ON "deliveries" ("status")`);

    // Table: payments
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id"          uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "orderId"     uuid          NOT NULL,
        "amount"      numeric(10,2) NOT NULL,
        "status"      "public"."payments_status_enum" NOT NULL DEFAULT 'pending',
        "method"      character varying NOT NULL,
        "externalId"  character varying,
        "confirmedAt" TIMESTAMP,
        "createdAt"   TIMESTAMP     NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_payments_orderId"  UNIQUE ("orderId"),
        CONSTRAINT "PK_payments_id"       PRIMARY KEY ("id"),
        CONSTRAINT "FK_payments_order"    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payments_status" ON "payments" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_payments_status"`);
    await queryRunner.query(`DROP TABLE "payments"`);

    await queryRunner.query(`DROP INDEX "IDX_deliveries_status"`);
    await queryRunner.query(`DROP INDEX "IDX_deliveries_driverId"`);
    await queryRunner.query(`DROP TABLE "deliveries"`);

    await queryRunner.query(`DROP INDEX "IDX_order_items_orderId"`);
    await queryRunner.query(`DROP TABLE "order_items"`);

    await queryRunner.query(`DROP INDEX "IDX_orders_status"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_restaurantId"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_customerId"`);
    await queryRunner.query(`DROP TABLE "orders"`);

    await queryRunner.query(`DROP INDEX "IDX_drivers_isAvailable"`);
    await queryRunner.query(`DROP TABLE "drivers"`);

    await queryRunner.query(`DROP INDEX "IDX_products_restaurantId"`);
    await queryRunner.query(`DROP TABLE "products"`);

    await queryRunner.query(`DROP INDEX "IDX_restaurants_name"`);
    await queryRunner.query(`DROP TABLE "restaurants"`);

    await queryRunner.query(`DROP INDEX "IDX_users_email"`);
    await queryRunner.query(`DROP TABLE "users"`);

    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."deliveries_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
