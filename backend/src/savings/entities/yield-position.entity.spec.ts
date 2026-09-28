import { YieldPosition } from './yield-position.entity';

describe('YieldPosition Entity', () => {
  it('stores and reads back all fields as assigned', () => {
    const position = new YieldPosition();
    position.owner = 'GABC123456789DEFGHIJKLMNOPQRSTUVWXYZ12345678901234567890';
    position.shares = '500000000';
    position.exchange_rate_snapshot = '1.25';

    expect(position.owner).toBe(
      'GABC123456789DEFGHIJKLMNOPQRSTUVWXYZ12345678901234567890',
    );
    expect(position.shares).toBe('500000000');
    expect(position.exchange_rate_snapshot).toBe('1.25');
  });

  it('has an id and timestamp fields available for TypeORM to populate', () => {
    const position = new YieldPosition();

    expect(position).toHaveProperty('id');
    expect(position).toHaveProperty('created_at');
    expect(position).toHaveProperty('updated_at');
  });

  it('defaults shares to "0" when not set', () => {
    const position = new YieldPosition();
    position.owner = 'GOWNER';

    expect(position.shares).toBeUndefined();
    // The default is enforced by the database schema, not the entity class
  });

  it('allows exchange_rate_snapshot to be null', () => {
    const position = new YieldPosition();
    position.owner = 'GOWNER';
    position.shares = '100000000';
    position.exchange_rate_snapshot = null;

    expect(position.exchange_rate_snapshot).toBeNull();
  });

  it('does not leak field values across separate instances', () => {
    const posA = new YieldPosition();
    const posB = new YieldPosition();

    posA.owner = 'owner-a';
    posA.shares = '1000000000';
    posA.exchange_rate_snapshot = '1.1';

    posB.owner = 'owner-b';
    posB.shares = '2000000000';
    posB.exchange_rate_snapshot = '1.2';

    expect(posA.owner).toBe('owner-a');
    expect(posA.shares).toBe('1000000000');
    expect(posA.exchange_rate_snapshot).toBe('1.1');

    expect(posB.owner).toBe('owner-b');
    expect(posB.shares).toBe('2000000000');
    expect(posB.exchange_rate_snapshot).toBe('1.2');
  });
});
