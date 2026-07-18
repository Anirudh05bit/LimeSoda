#!/usr/bin/env node
/**
 * TraceLens OS — MCP Server entry point.
 *
 * Bootstraps the @McpApp-decorated AppModule via McpApplicationFactory.
 * Production transport is dual (STDIO + HTTP Streamable / SSE) as handled
 * by @nitrostack/core.
 */

import 'reflect-metadata';
import 'dotenv/config';
import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  try {
    console.error('🔍 Starting TraceLens OS MCP Server...');

    const server = await McpApplicationFactory.create(AppModule);

    await server.start();
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
