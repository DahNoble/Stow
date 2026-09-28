import { ApiProperty } from '@nestjs/swagger';

/**
 * Response shape for `GET /savings/yield/rate`.
 */
export class YieldRateResponseDto {
  @ApiProperty({
    description: 'Current exchange rate (scaled integer, as a string)',
    example: '1111111111',
  })
  rate: string;

  @ApiProperty({
    description: 'Trailing-window APR derived from harvest history, as a decimal (e.g. 0.05 = 5%)',
    example: 0.0475,
    nullable: true,
  })
  apr: number | null;

  @ApiProperty({
    description: 'Number of days in the trailing window used for APR calculation',
    example: 30,
  })
  window_days: number;
}