import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { ManufacturerModule } from './manufacturer/manufacturer.module';
import { InvoiceModule } from './invoice/invoice.module';
import { TransactionModule } from './transaction/transaction.module';
import { LedgerModule } from './ledger/ledger.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, ManufacturerModule, InvoiceModule, TransactionModule, LedgerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
