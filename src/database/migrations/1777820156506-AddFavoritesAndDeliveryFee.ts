import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFavoritesAndDeliveryFee1777820156506 implements MigrationInterface {
    name = 'AddFavoritesAndDeliveryFee1777820156506'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_favorite_restaurants" ("userId" uuid NOT NULL, "restaurantId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a903186d725431a758d76fa6a01" PRIMARY KEY ("userId", "restaurantId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_favorite_restaurant" ON "user_favorite_restaurants" ("restaurantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_favorite_user" ON "user_favorite_restaurants" ("userId") `);
        await queryRunner.query(`ALTER TABLE "restaurants" ADD "deliveryFee" numeric(8,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "user_favorite_restaurants" ADD CONSTRAINT "FK_a9f766574cedeeab108017550a7" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_favorite_restaurants" ADD CONSTRAINT "FK_420f102c2d34a534c2e0df997ea" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_favorite_restaurants" DROP CONSTRAINT "FK_420f102c2d34a534c2e0df997ea"`);
        await queryRunner.query(`ALTER TABLE "user_favorite_restaurants" DROP CONSTRAINT "FK_a9f766574cedeeab108017550a7"`);
        await queryRunner.query(`ALTER TABLE "restaurants" DROP COLUMN "deliveryFee"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_favorite_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_favorite_restaurant"`);
        await queryRunner.query(`DROP TABLE "user_favorite_restaurants"`);
    }

}
