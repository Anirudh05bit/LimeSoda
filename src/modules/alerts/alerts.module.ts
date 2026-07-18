import { Module } from '@nitrostack/core';
import { AlertService } from './alerts.service.js';
import { AlertsTools } from './alerts.tools.js';

@Module({
  name: 'alerts',
  controllers: [AlertsTools],
  providers: [AlertService],
})
export class AlertsModule {}
