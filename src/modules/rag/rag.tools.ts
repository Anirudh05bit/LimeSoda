import { ToolDecorator as Tool, Injectable, z, ExecutionContext } from '@nitrostack/core';
import { RagService } from './rag.service.js';

@Injectable({ deps: [RagService] })
export class RagTools {
  constructor(private ragService: RagService) {}

  @Tool({
    name: 'search_regulations',
    title: 'Search Regulations & Precedents',
    description:
      'Search the regulatory knowledge base for relevant BSA/AML regulations, SAR precedents, investigation playbooks, and compliance guidance. Returns ranked results with document context.',
    inputSchema: z.object({
      query: z.string().describe('Search query, e.g. "mule account structuring BSA"'),
      limit: z.number().optional().describe('Max results to return (default 5)'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async searchRegulations(
    input: { query: string; limit?: number },
    context: ExecutionContext
  ) {
    const results = this.ragService.searchDocuments(input.query, input.limit ?? 5);

    return {
      query: input.query,
      resultCount: results.length,
      results: results.map(r => ({
        docId: r.docId,
        title: r.title,
        docType: r.docType,
        source: r.source,
        relevanceScore: r.score,
        excerpt: r.content.substring(0, 500) + (r.content.length > 500 ? '...' : ''),
      })),
    };
  }

  @Tool({
    name: 'get_regulation_detail',
    title: 'Get Regulation Detail',
    description:
      'Retrieve the full text of a specific regulatory document or playbook by its document ID.',
    inputSchema: z.object({
      docId: z.string().describe('Document ID, e.g. REG-BSA-001'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async getRegulationDetail(
    input: { docId: string },
    context: ExecutionContext
  ) {
    const doc = this.ragService.getDocument(input.docId);
    if (!doc) {
      throw new Error(`Document not found: ${input.docId}`);
    }

    const chunks = this.ragService.getDocumentChunks(input.docId);

    return {
      docId: doc.doc_id,
      title: doc.title,
      docType: doc.doc_type,
      source: doc.source,
      content: doc.content,
      chunkCount: chunks.length,
    };
  }
}
