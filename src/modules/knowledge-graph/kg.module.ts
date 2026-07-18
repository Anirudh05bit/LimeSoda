import { Module } from '@nitrostack/core';
import { KnowledgeGraphService } from './kg.service.js';
import { KnowledgeGraphTools } from './kg.tools.js';
import { KnowledgeGraphResources } from './kg.resources.js';

@Module({
  name: 'knowledge-graph',
  controllers: [KnowledgeGraphTools, KnowledgeGraphResources],
  providers: [KnowledgeGraphService],
})
export class KnowledgeGraphModule {}
