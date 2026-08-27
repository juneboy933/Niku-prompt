import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class InitiatePaymentDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  amount: number;
}