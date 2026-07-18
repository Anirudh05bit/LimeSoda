import { Module } from '@nitrostack/core';
import { GraphService } from './graph.service.js';
import { GraphTools } from './graph.tools.js';

@Module({
  name: 'graph',
  controllers: [GraphTools],
  providers: [GraphService],
})
export class GraphModule {}
