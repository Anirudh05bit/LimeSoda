import { ToolDecorator as Tool, Injectable, z, ExecutionContext } from '@nitrostack/core';
import { KnowledgeGraphService } from './kg.service.js';

@Injectable({ deps: [KnowledgeGraphService] })
export class KnowledgeGraphTools {
  constructor(private kgService: KnowledgeGraphService) {}

  @Tool({
    name: 'query_knowledge_graph',
    title: 'Query Knowledge Graph',
    description:
      'Query the knowledge graph for an entity and its neighbors up to a given depth. Returns connected entities, relationships, and risk scores. Use for entity resolution and network analysis.',
    inputSchema: z.object({
      entityId: z.string().describe('Entity ID, e.g. ENT-CUST-001, ENT-ACC-A001'),
      depth: z.number().optional().describe('Traversal depth (default 1, max 3)'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async queryKnowledgeGraph(
    input: { entityId: string; depth?: number },
    context: ExecutionContext
  ) {
    const depth = Math.min(input.depth ?? 1, 3);
    const result = this.kgService.getEntityNeighbors(input.entityId, depth);

    if (result.entities.length === 0) {
      throw new Error(`Entity not found: ${input.entityId}`);
    }

    return {
      entityId: input.entityId,
      depth,
      entityCount: result.entities.length,
      relationshipCount: result.relationships.length,
      entities: result.entities.map(e => ({
        entityId: e.entity_id,
        type: e.entity_type,
        name: e.name,
        riskScore: e.risk_score,
        attributes: e.attributes ? JSON.parse(e.attributes) : null,
      })),
      relationships: result.relationships.map(r => ({
        from: r.source_entity_id,
        to: r.target_entity_id,
        type: r.relationship_type,
        weight: r.weight,
      })),
    };
  }

  @Tool({
    name: 'find_connection_path',
    title: 'Find Connection Path',
    description:
      'Find the shortest path between two entities in the knowledge graph. Useful for tracing fund flows or identifying hidden connections between seemingly unrelated entities.',
    inputSchema: z.object({
      sourceId: z.string().describe('Source entity ID'),
      targetId: z.string().describe('Target entity ID'),
      maxDepth: z.number().optional().describe('Maximum path length (default 4)'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async findConnectionPath(
    input: { sourceId: string; targetId: string; maxDepth?: number },
    context: ExecutionContext
  ) {
    const paths = this.kgService.findPaths(input.sourceId, input.targetId, input.maxDepth ?? 4);

    return {
      source: input.sourceId,
      target: input.targetId,
      pathsFound: paths.length,
      shortestPath: paths[0] || null,
      allPaths: paths.slice(0, 5),
    };
  }

  @Tool({
    name: 'detect_mule_network',
    title: 'Detect Mule Network',
    description:
      'Analyze the knowledge graph for mule account networks and community structures. Identifies clusters of entities with high internal connectivity that may indicate organized fraud rings.',
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async detectMuleNetwork(
    input: {},
    context: ExecutionContext
  ) {
    const communities = this.kgService.detectCommunities();
    const highRisk = this.kgService.getHighRiskEntities(0.7);

    return {
      communityCount: communities.length,
      communities: communities.map(c => ({
        size: c.entities.length,
        internalEdges: c.internalEdges,
        density: c.entities.length > 1
          ? (c.internalEdges / (c.entities.length * (c.entities.length - 1) / 2)).toFixed(3)
          : '0',
        entityIds: c.entities,
      })),
      highRiskEntities: highRisk.map(e => ({
        entityId: e.entity_id,
        type: e.entity_type,
        name: e.name,
        riskScore: e.risk_score,
      })),
    };
  }

  @Tool({
    name: 'get_full_graph',
    title: 'Get Full Knowledge Graph',
    description:
      'Retrieve the complete knowledge graph with all entities and relationships. Use for full visualization or network analysis.',
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async getFullGraph(
    input: {},
    context: ExecutionContext
  ) {
    const graph = this.kgService.getFullGraph();

    return {
      entityCount: graph.entities.length,
      relationshipCount: graph.relationships.length,
      entities: graph.entities.map(e => ({
        entityId: e.entity_id,
        type: e.entity_type,
        name: e.name,
        riskScore: e.risk_score,
        attributes: e.attributes ? JSON.parse(e.attributes) : null,
      })),
      relationships: graph.relationships.map(r => ({
        from: r.source_entity_id,
        to: r.target_entity_id,
        type: r.relationship_type,
        weight: r.weight,
      })),
    };
  }
}
