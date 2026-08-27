import { Body, Controller, Post } from '@nestjs/common';
import { SmsService } from './sms.service';

@Controller('sms')
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  // Africa's Talking inbound SMS callback
  @Post('inbound')
  async inbound(@Body() body: { from: string; text: string }) {
    await this.smsService.handleInboundReply(body.from, body.text);
    return { status: 'received' };
  }
}
