import { Module } from '@nestjs/common';

export class EventEmitter2 {
  emit(): boolean {
    return false;
  }
}

export function OnEvent(): MethodDecorator {
  return () => undefined;
}

@Module({})
export class EventEmitterModule {
  static forRoot() {
    return {
      global: true,
      module: EventEmitterModule,
      providers: [EventEmitter2],
      exports: [EventEmitter2],
    };
  }
}
