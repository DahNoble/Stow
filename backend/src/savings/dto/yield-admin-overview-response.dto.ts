import { ApiProperty } from '@nestjs/swagger';

/**
 * Harvest history entry for the admin yield overview.
 */
export class HarvestHistoryEntryDto {
  @ApiProperty({
    description: 'Ledger timestamp when the harvest occurred',
    example: 1759000000,
  })
  timestamp: number;

  @ApiProperty({
    description: 'Yield delta (positive) or loss (negative) from the strategy',
    example: '15000000',
  })
  delta: string;

  @ApiProperty({
    description: 'Performance fee credited to FeesAccrued',
    example: '750000',
  })
  fee: string;

  @ApiProperty({
    description: 'Total assets after the harvest',
    example: '5000000000',
  })
  total_assets: string;
}

/**
 * Aggregate yield-adapter metrics returned by GET /admin/savings/yield/overview.
 *
 * Metrics:
 *  - active_strategy_id     — id of the currently active strategy, or null if idle
 *  - active_strategy_name   — display name of the active strategy, if known
 *  - total_assets           — total assets under management (in stroops)
 *  - total_shares           — total shares minted (in share units)
 *  - exchange_rate          — current shares-to-assets ratio (scaled integer as string)
 *  - accrued_fees           — accrued-but-unswept performance fees (in stroops)
 *  - harvest_history        — recent harvest events (last N harvests for trend analysis)
 *  - computed_at            — when these figures were calculated
 */
export class YieldAdminOverviewResponseDto {
  @ApiProperty({
    description: 'ID of the currently active strategy, or null if funds are idle',
    example: 1,
    nullable: true,
  })
  active_strategy_id: number | null;

  @ApiProperty({
    description: 'Display name of the active strategy',
    example: 'Stablecoin Lending Pool',
    nullable: true,
  })
  active_strategy_name: string | null;

  @ApiProperty({
    description: 'Total assets under management (in stroops)',
    example: '5000000000',
  })
  total_assets: string;

  @ApiProperty({
    description: 'Total shares minted (in share units)',
    example: '4500000000',
  })
  total_shares: string;

  @ApiProperty({
    description: 'Current exchange rate: shares-to-assets ratio (scaled integer as string)',
    example: '1111111111',
  })
  exchange_rate: string;

  @ApiProperty({
    description: 'Accrued-but-unswept performance fees (in stroops)',
    example: '750000',
  })
  accrued_fees: string;

  @ApiProperty({
    description: 'Recent harvest history for trend analysis',
    type: [HarvestHistoryEntryDto],
  })
  harvest_history: HarvestHistoryEntryDto[];

  @ApiProperty({
    description: 'UTC timestamp when these metrics were computed',
    example: '2026-09-27T12:00:00.000Z',
  })
  computed_at: string;
}