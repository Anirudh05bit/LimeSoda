import { Injectable } from '@nitrostack/core';
import Database from 'better-sqlite3';
import { DB_PATH } from '../../database/db-path.js';

export interface EntityRow {
  id: number;
  entity_id: string;
  entity_type: string;
  name: string;
  attributes: string | null;
  risk_score: number;
  created_at: string;
}

export interface RelationshipRow {
  id: number;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  weight: number;
  attributes: string | null;
}

export interface GraphPath {
  path: string[];
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    weight: number;
  }>;
  length: number;
}

@Injectable()
export class KnowledgeGraphService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  getEntity(entityId: string): EntityRow | null {
    return this.db.prepare(
      `SELECT id, entity_id, entity_type, name, attributes, risk_score, created_at
       FROM kg_entities WHERE entity_id = ?`
    ).get(entityId) as EntityRow | undefined || null;
  }

  getEntityNeighbors(entityId: string, depth: number = 1): {
    entities: EntityRow[];
    relationships: RelationshipRow[];
  } {
    const visited = new Set<string>();
    const entityIds: string[] = [entityId];
    let currentLayer = [entityId];

    // BFS to find neighbors up to depth
    for (let d = 0; d < depth; d++) {
      const nextLayer: string[] = [];
      for (const id of currentLayer) {
        if (visited.has(id)) continue;
        visited.add(id);

        const neighbors = this.db.prepare(`
          SELECT DISTINCT
            CASE WHEN source_entity_id = ? THEN target_entity_id ELSE source_entity_id END AS neighbor_id
          FROM kg_relationships
          WHERE source_entity_id = ? OR target_entity_id = ?
        `).all(id, id, id) as Array<{ neighbor_id: string }>;

        for (const n of neighbors) {
          if (!visited.has(n.neighbor_id)) {
            nextLayer.push(n.neighbor_id);
            entityIds.push(n.neighbor_id);
          }
        }
      }
      currentLayer = nextLayer;
    }

    const entities = entityIds.length > 0
      ? this.db.prepare(
          `SELECT id, entity_id, entity_type, name, attributes, risk_score, created_at
           FROM kg_entities WHERE entity_id IN (${entityIds.map(() => '?').join(',')})`
        ).all(...entityIds) as EntityRow[]
      : [];

    const relationships = this.db.prepare(`
      SELECT id, source_entity_id, target_entity_id, relationship_type, weight, attributes
      FROM kg_relationships
      WHERE source_entity_id IN (${entityIds.map(() => '?').join(',')})
         OR target_entity_id IN (${entityIds.map(() => '?').join(',')})
    `).all(...entityIds, ...entityIds) as RelationshipRow[];

    return { entities, relationships };
  }

  findPaths(sourceId: string, targetId: string, maxDepth: number = 4): GraphPath[] {
    const paths: GraphPath[] = [];
    const queue: Array<{ current: string; path: string[]; rels: GraphPath['relationships'] }> = [
      { current: sourceId, path: [sourceId], rels: [] }
    ];
    const visited = new Set<string>();

    while (queue.length > 0 && paths.length < 10) {
      const { current, path, rels } = queue.shift()!;

      if (current === targetId && path.length > 1) {
        paths.push({ path, relationships: rels, length: path.length - 1 });
        continue;
      }

      if (path.length > maxDepth || visited.has(current)) continue;
      visited.add(current);

      const neighbors = this.db.prepare(`
        SELECT target_entity_id AS neighbor_id, relationship_type, weight
        FROM kg_relationships WHERE source_entity_id = ?
        UNION
        SELECT source_entity_id AS neighbor_id, relationship_type, weight
        FROM kg_relationships WHERE target_entity_id = ?
      `).all(current, current) as Array<{ neighbor_id: string; relationship_type: string; weight: number }>;

      for (const n of neighbors) {
        if (!path.includes(n.neighbor_id)) {
          queue.push({
            current: n.neighbor_id,
            path: [...path, n.neighbor_id],
            rels: [...rels, { from: current, to: n.neighbor_id, type: n.relationship_type, weight: n.weight }],
          });
        }
      }
    }

    return paths;
  }

  detectCommunities(): Array<{ entities: string[]; internalEdges: number }> {
    // Simple connected-component detection
    const allEntities = this.db.prepare(`SELECT entity_id FROM kg_entities`).all() as { entity_id: string }[];
    const adj = new Map<string, Set<string>>();

    for (const e of allEntities) {
      adj.set(e.entity_id, new Set());
    }

    const edges = this.db.prepare(`SELECT source_entity_id, target_entity_id FROM kg_relationships`).all() as RelationshipRow[];
    for (const edge of edges) {
      adj.get(edge.source_entity_id)?.add(edge.target_entity_id);
      adj.get(edge.target_entity_id)?.add(edge.source_entity_id);
    }

    const visited = new Set<string>();
    const communities: Array<{ entities: string[]; internalEdges: number }> = [];

    for (const start of allEntities) {
      if (visited.has(start.entity_id)) continue;

      const component: string[] = [];
      const stack = [start.entity_id];

      while (stack.length > 0) {
        const node = stack.pop()!;
        if (visited.has(node)) continue;
        visited.add(node);
        component.push(node);

        for (const neighbor of adj.get(node) || []) {
          if (!visited.has(neighbor)) stack.push(neighbor);
        }
      }

      if (component.length > 1) {
        let internalEdges = 0;
        for (const edge of edges) {
          if (component.includes(edge.source_entity_id) && component.includes(edge.target_entity_id)) {
            internalEdges++;
          }
        }
        communities.push({ entities: component, internalEdges });
      }
    }

    return communities.sort((a, b) => b.entities.length - a.entities.length);
  }

  getHighRiskEntities(threshold: number = 0.7): EntityRow[] {
    return this.db.prepare(
      `SELECT id, entity_id, entity_type, name, attributes, risk_score, created_at
       FROM kg_entities WHERE risk_score >= ?
       ORDER BY risk_score DESC`
    ).all(threshold) as EntityRow[];
  }

  getFullGraph(): { entities: EntityRow[]; relationships: RelationshipRow[] } {
    const entities = this.db.prepare(
      `SELECT id, entity_id, entity_type, name, attributes, risk_score, created_at
       FROM kg_entities ORDER BY entity_type, name`
    ).all() as EntityRow[];

    const relationships = this.db.prepare(
      `SELECT id, source_entity_id, target_entity_id, relationship_type, weight, attributes
       FROM kg_relationships`
    ).all() as RelationshipRow[];

    return { entities, relationships };
  }

  addEntity(entityId: string, entityType: string, name: string, attributes?: object, riskScore?: number): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO kg_entities (entity_id, entity_type, name, attributes, risk_score)
       VALUES (?, ?, ?, ?, ?)`
    ).run(entityId, entityType, name, attributes ? JSON.stringify(attributes) : null, riskScore ?? 0);
  }

  addRelationship(sourceId: string, targetId: string, relationshipType: string, weight: number = 1.0, attributes?: object): void {
    this.db.prepare(
      `INSERT INTO kg_relationships (source_entity_id, target_entity_id, relationship_type, weight, attributes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sourceId, targetId, relationshipType, weight, attributes ? JSON.stringify(attributes) : null);
  }
}
