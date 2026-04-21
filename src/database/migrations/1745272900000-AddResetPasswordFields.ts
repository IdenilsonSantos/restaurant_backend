import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResetPasswordFields1745272900000 implements MigrationInterface {
  name = 'AddResetPasswordFields1745272900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "resetPasswordToken" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "resetPasswordExpires" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "resetPasswordExpires"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "resetPasswordToken"`,
    );
  }
}
