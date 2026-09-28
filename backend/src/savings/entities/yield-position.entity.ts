import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A yield-adapter position projected from the contract's `deposited`,
 * `withdraw_requested`, `withdraw_claimed`, and `withdraw_cancelled` events.
 *
 * One row per owner — upserted by the indexer as events arrive.
 * Stores shares and a snapshot of the exchange rate for fast reads without
 * requiring an RPC round-trip.
 */
@Entity('yield_positions')
@Index(['owner'], { unique: true })
export class YieldPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stellar account address of the position owner. */
  @Column({ type: 'varchar' })
  owner: string;

  /**
   * Number of shares held in the yield-adapter.
   * Stored as a string to avoid JS number precision loss on large i128 values.
   */
  @Column({ type: 'varchar', default: '0' })
  shares: string;

  /**
   * Last-known exchange rate snapshot (shares-to-assets ratio).
   * Stored as a string to preserve precision.
   * Used with `shares` to calculate approximate current asset value without RPC.
   */
  @Column({ type: 'varchar', nullable: true })
  exchange_rate_snapshot: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
