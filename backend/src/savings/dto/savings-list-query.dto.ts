import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { SavingsListQueryDto } from './pagination.dto';
import { STELLAR_ACCOUNT_ADDRESS_PATTERN } from './stellar-address.dto';

export class SavingsAddressListQueryDto extends SavingsListQueryDto {
  @ApiProperty({ description: 'Stellar public account address' })
  @IsString()
  @Matches(STELLAR_ACCOUNT_ADDRESS_PATTERN, {
    message: 'address must be a valid Stellar account address',
  })
  address: string;
}