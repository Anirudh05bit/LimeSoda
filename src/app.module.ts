import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { CasesModule } from './modules/cases/cases.module.js';
import { AlertsModule } from './modules/alerts/alerts.module.js';
import { GraphModule } from './modules/graph/graph.module.js';
import { NarrativesModule } from './modules/narratives/narratives.module.js';

@McpApp({
  module: AppModule,
  server: {
    name: 'tracelens-server',
    version: '0.1.0',
  },
  logging: {
    level: 'info',
  },
})
@Module({
  name: 'app',
  imports: [
    ConfigModule.forRoot(),
    CasesModule,
    AlertsModule,
    GraphModule,
    NarrativesModule,
  ],
})
export class AppModule {}
