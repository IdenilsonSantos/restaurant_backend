import { MigrationInterface, QueryRunner } from 'typeorm';
import { DEFAULT_PAYMENT_METHODS } from '../../modules/payment/entities/payment-method.entity';

export class AddPaymentMethods1745273000000 implements MigrationInterface {
  name = 'AddPaymentMethods1745273000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."payment_methods_code_enum" AS ENUM(
        'pix', 'credit_card', 'debit_card', 'cash',
        'food_voucher', 'meal_voucher', 'boleto', 'crypto'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_methods" (
        "id"       uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name"     character varying NOT NULL,
        "code"     "public"."payment_methods_code_enum" NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_payment_methods_code" UNIQUE ("code"),
        CONSTRAINT "PK_payment_methods_id"   PRIMARY KEY ("id")
      )
    `);

    for (const m of DEFAULT_PAYMENT_METHODS) {
      await queryRunner.query(
        `INSERT INTO "payment_methods" ("name", "code", "isActive") VALUES ($1, $2, $3)`,
        [m.name, m.code, m.isActive],
      );
    }

    await queryRunner.query(
      `ALTER TABLE "payments" ADD COLUMN "paymentMethodId" uuid`,
    );

    await queryRunner.query(`
      UPDATE "payments" SET "paymentMethodId" = pm.id
      FROM "payment_methods" pm
      WHERE pm.code::text = "payments"."method"
    `);

    await queryRunner.query(`
      UPDATE "payments" SET "paymentMethodId" = (
        SELECT id FROM "payment_methods" WHERE code = 'credit_card' LIMIT 1
      ) WHERE "paymentMethodId" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "paymentMethodId" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD CONSTRAINT "FK_payments_payment_method"
        FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "method"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" ADD COLUMN "method" character varying`,
    );
    await queryRunner.query(`
      UPDATE "payments" SET "method" = pm.code::text
      FROM "payment_methods" pm
      WHERE pm.id = "payments"."paymentMethodId"
    `);
    await queryRunner.query(
      `UPDATE "payments" SET "method" = 'credit_card' WHERE "method" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "method" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_payment_method"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN "paymentMethodId"`,
    );

    await queryRunner.query(`DROP TABLE "payment_methods"`);
    await queryRunner.query(`DROP TYPE "public"."payment_methods_code_enum"`);
  }
}
