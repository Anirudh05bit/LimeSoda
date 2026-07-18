import { Module } from '@nitrostack/core';
import { alertsTools } from './alerts.tools.js';
import { alertsResources } from './alerts.resources.js';
import { alertsPrompts } from './alerts.prompts.js';

@Module({
  name: 'alerts',
  description: 'TODO: Add description',
  controllers: [alertsTools, alertsResources, alertsPrompts],
})
export class alertsModule {}
