import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { STELLAR_ACCOUNT_ADDRESS_PATTERN } from './stellar-address.dto';

export class InitiateDepositDto {
  /** Asset code to deposit (e.g. "USDC") */
  @ApiProperty({ example: 'USDC', description: 'Asset code to deposit' })
  @IsString()
  @IsNotEmpty()
  asset_code: string;

  /** Stellar account that will receive the deposit */
  @ApiProperty({ example: 'GSTELLAR...', description: 'Stellar account address' })
  @IsString()
  @IsNotEmpty()
  @Matches(STELLAR_ACCOUNT_ADDRESS_PATTERN, {
    message: 'account must be a valid Stellar account address',
  })
  account: string;
}
