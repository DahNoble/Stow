import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export const STELLAR_ACCOUNT_ADDRESS_PATTERN = /^G[A-Z2-7]{55}$/;

export class SavingsAddressParamDto {
  @ApiProperty({ description: 'Stellar public account address' })
  @IsString()
  @Matches(STELLAR_ACCOUNT_ADDRESS_PATTERN, {
    message: 'address must be a valid Stellar account address',
  })
  address: string;
}

export class SavingsAccountParamDto {
  @ApiProperty({ description: 'Stellar public account address' })
  @IsString()
  @Matches(STELLAR_ACCOUNT_ADDRESS_PATTERN, {
    message: 'account must be a valid Stellar account address',
  })
  account: string;
}