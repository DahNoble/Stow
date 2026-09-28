import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class Sep38QuoteQueryDto {
  @ApiProperty({ example: 'iso4217:NGN' })
  @IsString()
  @Matches(/^[a-zA-Z0-9:_-]+$/)
  sell_asset: string;

  @ApiProperty({
    example:
      'stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  })
  @IsString()
  @Matches(/^[a-zA-Z0-9:_-]+$/)
  buy_asset: string;

  @ApiProperty({ example: '10000' })
  @IsString()
  @Matches(/^(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)$/, {
    message: 'sell_amount must be a positive decimal amount',
  })
  sell_amount: string;
}