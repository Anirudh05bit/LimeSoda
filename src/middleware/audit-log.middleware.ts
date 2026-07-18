import type { MiddlewareInterface, ExecutionContext } from '@nitrostack/core';
import Database from 'better-sqlite3';
import { DB_PATH } from '../database/db-path.js';

export class AuditLogMiddleware implements MiddlewareInterface {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
  }

  async use(
    context: ExecutionContext,
    next: () => Promise<any>
  ): Promise<any> {
    const toolName = context.toolName ?? 'unknown';
    const actorSubject = (context.auth?.subject as string) ?? null;
    const actorRole = (context.auth?.role as string) ?? null;

    let inputJson: string | null = null;
    let outputJson: string | null = null;
    let errorJson: string | null = null;

    try {
      const result = await next();

      outputJson = JSON.stringify(result ?? null);
      return result;
    } catch (error) {
      errorJson = JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    } finally {
      const finalOutput = errorJson
        ? JSON.stringify({ error: JSON.parse(errorJson) })
        : outputJson;

      try {
        this.db
          .prepare(
            `INSERT INTO audit_log (tool_name, input_json, output_json, actor_subject, actor_role)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(toolName, inputJson, finalOutput, actorSubject, actorRole);
      } catch {
        // Audit write failure must not break the request
      }
    }
  }
}
