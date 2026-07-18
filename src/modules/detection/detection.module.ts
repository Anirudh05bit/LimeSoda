import { Module } from '@nitrostack/core';
import { DetectionService } from './detection.service.js';
import { DetectionTools } from './detection.tools.js';

@Module({
  name: 'detection',
  controllers: [DetectionTools],
  providers: [DetectionService],
})
export class DetectionModule {}
