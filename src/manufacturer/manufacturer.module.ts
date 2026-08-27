import { Module } from '@nestjs/common';
import { ManufacturerService } from './manufacturer.service';

@Module({
  providers: [ManufacturerService],
  exports: [ManufacturerService],
})
export class ManufacturerModule {}
