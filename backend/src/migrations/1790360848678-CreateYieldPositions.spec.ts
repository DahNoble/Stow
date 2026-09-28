import { QueryRunner, Table } from 'typeorm';
import { CreateYieldPositions1790360848678 } from './1790360848678-CreateYieldPositions';

describe('CreateYieldPositions1790360848678', () => {
  let migration: CreateYieldPositions1790360848678;
  let queryRunner: {
    createTable: jest.Mock;
    dropTable: jest.Mock;
  };

  beforeEach(() => {
    migration = new CreateYieldPositions1790360848678();
    queryRunner = {
      createTable: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('creates the yield_positions table on up()', async () => {
    await migration.up(queryRunner as unknown as QueryRunner);

    expect(queryRunner.createTable).toHaveBeenCalledTimes(1);
    const [table] = queryRunner.createTable.mock.calls[0];
    expect(table).toBeInstanceOf(Table);
    expect(table.name).toBe('yield_positions');
  });

  it('creates the table with required columns', async () => {
    await migration.up(queryRunner as unknown as QueryRunner);

    const [table] = queryRunner.createTable.mock.calls[0] as [Table];
    const columnNames = table.columns.map((c) => c.name);

    expect(columnNames).toEqual(
      expect.arrayContaining([
        'id',
        'owner',
        'shares',
        'exchange_rate_snapshot',
        'created_at',
        'updated_at',
      ]),
    );
  });

  it('creates id as uuid primary key', async () => {
    await migration.up(queryRunner as unknown as QueryRunner);

    const [table] = queryRunner.createTable.mock.calls[0] as [Table];
    const idColumn = table.columns.find((c) => c.name === 'id');

    expect(idColumn).toBeDefined();
    expect(idColumn?.isPrimary).toBe(true);
    expect(idColumn?.type).toBe('uuid');
    expect(idColumn?.generationStrategy).toBe('uuid');
  });

  it('creates owner column as non-nullable varchar', async () => {
    await migration.up(queryRunner as unknown as QueryRunner);

    const [table] = queryRunner.createTable.mock.calls[0] as [Table];
    const ownerColumn = table.columns.find((c) => c.name === 'owner');

    expect(ownerColumn).toBeDefined();
    expect(ownerColumn?.type).toBe('varchar');
    expect(ownerColumn?.isNullable).toBe(false);
  });

  it('creates shares column with default "0"', async () => {
    await migration.up(queryRunner as unknown as QueryRunner);

    const [table] = queryRunner.createTable.mock.calls[0] as [Table];
    const sharesColumn = table.columns.find((c) => c.name === 'shares');

    expect(sharesColumn).toBeDefined();
    expect(sharesColumn?.type).toBe('varchar');
    expect(sharesColumn?.default).toBe("'0'");
    expect(sharesColumn?.isNullable).toBe(false);
  });

  it('creates exchange_rate_snapshot as nullable varchar', async () => {
    await migration.up(queryRunner as unknown as QueryRunner);

    const [table] = queryRunner.createTable.mock.calls[0] as [Table];
    const rateColumn = table.columns.find((c) => c.name === 'exchange_rate_snapshot');

    expect(rateColumn).toBeDefined();
    expect(rateColumn?.type).toBe('varchar');
    expect(rateColumn?.isNullable).toBe(true);
  });

  it('creates created_at and updated_at with timestamp defaults', async () => {
    await migration.up(queryRunner as unknown as QueryRunner);

    const [table] = queryRunner.createTable.mock.calls[0] as [Table];
    const createdAtColumn = table.columns.find((c) => c.name === 'created_at');
    const updatedAtColumn = table.columns.find((c) => c.name === 'updated_at');

    expect(createdAtColumn?.type).toBe('timestamp');
    expect(createdAtColumn?.default).toBe('now()');
    expect(updatedAtColumn?.type).toBe('timestamp');
    expect(updatedAtColumn?.default).toBe('now()');
  });

  it('creates a unique index on owner', async () => {
    await migration.up(queryRunner as unknown as QueryRunner);

    const [table] = queryRunner.createTable.mock.calls[0] as [Table];
    const ownerIndex = table.indices?.find(
      (idx) => idx.columnNames?.includes('owner'),
    );

    expect(ownerIndex).toBeDefined();
    expect(ownerIndex?.isUnique).toBe(true);
    expect(ownerIndex?.name).toBe('IDX_yield_positions_owner');
  });

  it('drops the yield_positions table on down()', async () => {
    await migration.down(queryRunner as unknown as QueryRunner);

    expect(queryRunner.dropTable).toHaveBeenCalledTimes(1);
    expect(queryRunner.dropTable).toHaveBeenCalledWith('yield_positions');
  });
});
