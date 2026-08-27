import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ManufacturerService {
  constructor(private readonly prisma: PrismaService) {}

  //   Find manufacturer by phone
  async findByPhone(phone: string) {
    return await this.prisma.manufacturer.findUnique({
      where: { phoneNumber: phone },
    });
  }

  async findById(manufacturerId: string) {
    const manufacturer = await this.prisma.manufacturer.findUnique({
      where: { id: manufacturerId },
    });
    if (!manufacturer) {
      throw new NotFoundException('Manufacturer not found');
    }

    return manufacturer;
  }

  // Create a new manufacturer
  async createManufacturer(phone: string, businessName: string) {
    const existing = await this.findByPhone(phone);
    if (existing) throw new ConflictException('Manufacture already exists');
    const result = await this.prisma.manufacturer.create({
      data: {
        phoneNumber: phone,
        businessName,
      },
    });

    return {
      message: 'Manufacturer created successfully',
      data: result,
    };
  }
}
