import { Injectable } from '@nitrostack/core';
import Database from 'better-sqlite3';
import { DB_PATH } from '../../database/db-path.js';

interface DocumentRow {
  id: number;
  doc_id: string;
  title: string;
  doc_type: string;
  source: string | null;
  content: string;
  created_at: string;
}

interface ChunkRow {
  id: number;
  document_id: number;
  chunk_index: number;
  content: string;
  keywords: string | null;
}

interface SearchResult {
  docId: string;
  title: string;
  docType: string;
  source: string | null;
  chunkIndex: number;
  content: string;
  score: number;
}

@Injectable()
export class RagService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  searchDocuments(query: string, limit: number = 5): SearchResult[] {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (terms.length === 0) return [];

    const chunks = this.db.prepare(`
      SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.keywords,
             d.doc_id, d.title, d.doc_type, d.source
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
    `).all() as Array<ChunkRow & { doc_id: string; title: string; doc_type: string; source: string | null }>;

    const scored: SearchResult[] = [];

    for (const chunk of chunks) {
      const contentLower = chunk.content.toLowerCase();
      const keywordsLower = (chunk.keywords || '').toLowerCase();
      let score = 0;

      for (const term of terms) {
        // Exact word match in content
        const contentMatches = (contentLower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        score += contentMatches * 2;

        // Keyword match (higher weight)
        if (keywordsLower.includes(term)) {
          score += 5;
        }

        // Title match
        if (chunk.title.toLowerCase().includes(term)) {
          score += 3;
        }
      }

      if (score > 0) {
        scored.push({
          docId: chunk.doc_id,
          title: chunk.title,
          docType: chunk.doc_type,
          source: chunk.source,
          chunkIndex: chunk.chunk_index,
          content: chunk.content,
          score,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  getDocument(docId: string): DocumentRow | null {
    return this.db.prepare(
      `SELECT id, doc_id, title, doc_type, source, content, created_at
       FROM documents WHERE doc_id = ?`
    ).get(docId) as DocumentRow | undefined || null;
  }

  getDocumentChunks(docId: string): ChunkRow[] {
    return this.db.prepare(`
      SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.keywords
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      WHERE d.doc_id = ?
      ORDER BY dc.chunk_index
    `).all(docId) as ChunkRow[];
  }

  listDocuments(docType?: string): DocumentRow[] {
    if (docType) {
      return this.db.prepare(
        `SELECT id, doc_id, title, doc_type, source, content, created_at
         FROM documents WHERE doc_type = ? ORDER BY title`
      ).all(docType) as DocumentRow[];
    }
    return this.db.prepare(
      `SELECT id, doc_id, title, doc_type, source, content, created_at
       FROM documents ORDER BY doc_type, title`
    ).all() as DocumentRow[];
  }

  ingestDocument(docId: string, title: string, docType: string, source: string, content: string): void {
    const insertDoc = this.db.prepare(
      `INSERT INTO documents (doc_id, title, doc_type, source, content) VALUES (?, ?, ?, ?, ?)`
    );
    const insertChunk = this.db.prepare(
      `INSERT INTO document_chunks (document_id, chunk_index, content, keywords) VALUES (?, ?, ?, ?)`
    );

    const result = insertDoc.run(docId, title, docType, source, content);
    const documentId = result.lastInsertRowid;

    // Chunk by paragraphs, ~500 chars each
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
    let chunkIndex = 0;
    let currentChunk = '';

    for (const para of paragraphs) {
      if (currentChunk.length + para.length > 500 && currentChunk.length > 0) {
        const keywords = this.extractKeywords(currentChunk);
        insertChunk.run(documentId, chunkIndex, currentChunk.trim(), keywords);
        chunkIndex++;
        currentChunk = '';
      }
      currentChunk += para + '\n\n';
    }

    if (currentChunk.trim().length > 0) {
      const keywords = this.extractKeywords(currentChunk);
      insertChunk.run(documentId, chunkIndex, currentChunk.trim(), keywords);
    }
  }

  private extractKeywords(text: string): string {
    const stopWords = new Set([
      'the','a','an','is','are','was','were','be','been','being','have','has','had',
      'do','does','did','will','would','shall','should','may','might','can','could',
      'to','of','in','for','on','with','at','by','from','as','into','through','during',
      'before','after','above','below','between','under','again','further','then','once',
      'here','there','when','where','why','how','all','both','each','few','more','most',
      'other','some','such','no','nor','not','only','own','same','so','than','too','very',
      'just','because','but','and','or','if','while','about','against','it','its','this',
      'that','these','those','i','me','my','we','our','you','your','he','him','his','she',
      'her','they','them','their','what','which','who','whom'
    ]);

    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const freq = new Map<string, number>();

    for (const word of words) {
      if (word.length < 3 || stopWords.has(word)) continue;
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word]) => word)
      .join(',');
  }
}
