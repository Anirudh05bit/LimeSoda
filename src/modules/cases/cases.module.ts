import { Module } from '@nitrostack/core';
import { CaseService } from './cases.service.js';
import { CasesResources } from './cases.resources.js';

@Module({
  name: 'cases',
  controllers: [CasesResources],
  providers: [CaseService],
})
export class CasesModule {}
