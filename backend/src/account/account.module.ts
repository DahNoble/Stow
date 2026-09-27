import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { DataExportJob } from './entities/data-export-job.entity';
import { YieldPosition } from '../savings/entities/yield-position.entity';
import { ContractEvent } from '../indexer/entities/contract-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DataExportJob, YieldPosition, ContractEvent])],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
