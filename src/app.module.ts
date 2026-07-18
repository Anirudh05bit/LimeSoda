import { McpApp, Module } from '@nitrostack/core';
import { ConfigModule } from 'nitrostack/config';
import { CasesModule } from './modules/cases/cases.module.js';

@McpApp({
  server: {
    name: 'tracelens-server',
    version: '0.1.0',
    description: 'TraceLens OS — MCP-native financial crime investigation platform',
  },
  logging: {
    level: 'info',
  },
})
@Module({
  imports: [
    ConfigModule.forRoot(),
    CasesModule,
  ],
})
export class AppModule {}
