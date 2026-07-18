import { ResourceDecorator as Resource, Injectable, ExecutionContext } from '@nitrostack/core';
import Database from 'better-sqlite3';
import { DB_PATH } from '../../database/db-path.js';
import { KnowledgeGraphService } from './kg.service.js';

@Injectable({ deps: [KnowledgeGraphService] })
export class KnowledgeGraphResources {
  private db: Database.Database;

  constructor(private kgService: KnowledgeGraphService) {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  private isTemplateParam(value: string): boolean {
    return /^\{.*\}$/.test(value);
  }

  @Resource({
    uri: 'kg://{entityId}/subgraph',
    name: 'Entity Subgraph',
    description: 'Knowledge graph subgraph centered on a specific entity, including neighbors and relationships',
    mimeType: 'application/json',
    annotations: {
      audience: ['assistant'],
      priority: 0.9,
    },
  })
  async getEntitySubgraph(uri: string, context: ExecutionContext) {
    const match = uri.match(/kg:\/\/([A-Za-z0-9_{}-]+)\/subgraph/);
    if (!match) {
      throw new Error(`Invalid KG subgraph URI: ${uri}`);
    }
    const entityId = match[1];
    if (this.isTemplateParam(entityId)) {
      const examples = (this.db.prepare('SELECT entity_id FROM kg_entities ORDER BY entity_id LIMIT 10').all() as { entity_id: string }[]).map(r => r.entity_id);
      return { contents: [{ uri, mimeType: 'text/plain', text: `Resource Template: ${uri}\n\nThis is a template resource. Replace {entityId} with an actual entity ID.\n\nAvailable values (first 10):\n${examples.map(v => `  ${v}`).join('\n')}\n\nExample: kg://${examples[0] || 'ENT-PER-001'}/subgraph` }] };
    }
    const result = this.kgService.getEntityNeighbors(entityId, 2);

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }

  @Resource({
    uri: 'kg://full',
    name: 'Full Knowledge Graph',
    description: 'Complete knowledge graph with all entities and relationships',
    mimeType: 'application/json',
    annotations: {
      audience: ['assistant'],
      priority: 0.7,
    },
  })
  async getFullGraph(uri: string, context: ExecutionContext) {
    const graph = this.kgService.getFullGraph();

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(graph, null, 2),
      }],
    };
  }
}
