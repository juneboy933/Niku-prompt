import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UssdService } from './ussd.service';

@Controller('ussd')
export class UssdController {
  constructor(private readonly ussdService: UssdService) {}

  @Post()
  async handle(
    @Body()
    body: {
      sessionId: string;
      serviceCode: string;
      phoneNumber: string;
      text: string;
    },
    @Res() res: Response,
  ) {
    const response = await this.ussdService.handleSession(
      body.phoneNumber,
      body.text ?? '',
    );
    res.set('Content-Type', 'text/plain');
    res.send(response);
  }
}
