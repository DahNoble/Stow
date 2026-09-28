import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class YieldDepositDto {
  @ApiProperty({
    description: 'Amount to deposit into the yield adapter (in stroops)',
    example: '10000000',
  })
  @IsString()
  @IsNotEmpty()
  amount: string;
}

export class YieldWithdrawRequestDto {
  @ApiProperty({
    description: 'Shares to withdraw from the yield adapter',
    example: '5000000',
  })
  @IsString()
  @IsNotEmpty()
  shares: string;
}
