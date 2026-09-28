import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Creates the `yield_positions` table to project yield-adapter positions
 * from `deposited`, `withdraw_requested`, `withdraw_claimed`, and
 * `withdraw_cancelled` events.
 *
 * One row per owner, upserted by the indexer as events arrive.
 */
export class CreateYieldPositions1790360848678 implements MigrationInterface {
  name = 'CreateYieldPositions1790360848678';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'yield_positions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'owner',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'shares',
            type: 'varchar',
            default: "'0'",
            isNullable: false,
          },
          {
            name: 'exchange_rate_snapshot',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_yield_positions_owner',
            columnNames: ['owner'],
            isUnique: true,
          }),
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('yield_positions');
  }
}
