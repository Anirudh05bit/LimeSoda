import { ResourceDecorator as Resource, Injectable, ExecutionContext } from '@nitrostack/core';
import Database from 'better-sqlite3';
import { DB_PATH } from '../../database/db-path.js';
import { RagService } from './rag.service.js';

@Injectable({ deps: [RagService] })
export class RagResources {
  private db: Database.Database;

  constructor(private ragService: RagService) {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  private isTemplateParam(value: string): boolean {
    return /^\{.*\}$/.test(value);
  }

  private listDocIds(): string[] {
    return (this.db.prepare('SELECT doc_id FROM documents ORDER BY doc_id').all() as { doc_id: string }[]).map(r => r.doc_id);
  }

  private templateText(uri: string, paramName: string, examples: string[], exampleUri: string): string {
    return [
      `Resource Template: ${uri}`,
      ``,
      `This is a template resource. Replace ${paramName} with an actual value.`,
      ``,
      `Available values:`,
      ...examples.map(v => `  ${v}`),
      ``,
      `Example: ${exampleUri}`,
    ].join('\n');
  }

  @Resource({
    uri: 'regulation://search/{query}',
    name: 'Regulation Search',
    description: 'Search the regulatory knowledge base for BSA/AML guidance, SAR precedents, and investigation playbooks',
    mimeType: 'application/json',
    annotations: {
      audience: ['assistant'],
      priority: 0.85,
    },
  })
  async searchRegulations(uri: string, context: ExecutionContext) {
    const match = uri.match(/regulation:\/\/search\/(.+)/);
    if (!match) {
      throw new Error(`Invalid regulation search URI: ${uri}`);
    }
    const query = decodeURIComponent(match[1]);
    if (this.isTemplateParam(query)) {
      return { contents: [{ uri, mimeType: 'text/plain', text: `Resource Template: ${uri}\n\nThis is a template resource. Replace {query} with a search term e.g.\n  regulation://search/structuring\n  regulation://search/mule%20account\n  regulation://search/FATF%20recommendations` }] };
    }
    const results = this.ragService.searchDocuments(query, 5);

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ query, results }, null, 2),
      }],
    };
  }

  @Resource({
    uri: 'regulation://{docId}',
    name: 'Regulation Document',
    description: 'Full text of a specific regulatory document or playbook',
    mimeType: 'application/json',
    annotations: {
      audience: ['assistant'],
      priority: 0.9,
    },
  })
  async getDocument(uri: string, context: ExecutionContext) {
    const match = uri.match(/regulation:\/\/([A-Z0-9{}_-]+)/);
    if (!match) {
      throw new Error(`Invalid regulation URI: ${uri}`);
    }
    const docId = match[1];
    if (this.isTemplateParam(docId)) {
      const ids = this.listDocIds();
      return { contents: [{ uri, mimeType: 'text/plain', text: this.templateText(uri, '{docId}', ids, `regulation://${ids[0] || 'REG-BSA-001'}`) }] };
    }
    const doc = this.ragService.getDocument(docId);
    if (!doc) {
      throw new Error(`Document not found: ${docId}`);
    }

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(doc, null, 2),
      }],
    };
  }
}
