import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';

@Module({
  providers: [LedgerService]
})
export class LedgerModule {}
