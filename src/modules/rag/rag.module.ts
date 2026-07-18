import { Module } from '@nitrostack/core';
import { RagService } from './rag.service.js';
import { RagTools } from './rag.tools.js';
import { RagResources } from './rag.resources.js';

@Module({
  name: 'rag',
  controllers: [RagTools, RagResources],
  providers: [RagService],
})
export class RagModule {}
