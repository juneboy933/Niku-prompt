import { Test, TestingModule } from '@nestjs/testing';
import { UssdController } from './ussd.controller';
import { UssdService } from './ussd.service';

describe('UssdController', () => {
  let controller: UssdController;
  const ussdService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UssdController],
      providers: [{ provide: UssdService, useValue: ussdService }],
    }).compile();

    controller = module.get<UssdController>(UssdController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
