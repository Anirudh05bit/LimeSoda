import { Module } from '@nitrostack/core';
import { CasesModule } from '../cases/cases.module.js';
import { CaseService } from '../cases/cases.service.js';
import { NarrativesTools } from './narratives.tools.js';
import { NarrativesPrompts } from './narratives.prompts.js';

@Module({
  name: 'narratives',
  imports: [CasesModule],
  controllers: [NarrativesTools, NarrativesPrompts],
  providers: [CaseService],
})
export class NarrativesModule {}
