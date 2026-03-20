import { Readable } from 'node:stream';
import type { PoolClient } from 'pg';
import { PoolManager } from './pool.js';
import type { Config, QueryResult, CopyResult, PoolStatus } from './types.js';

export { EasyPostgresError, ConnectionError, QueryError, TransactionError, CopyError } from './errors.js';
export type { Config, QueryResult, CopyResult, PoolStatus } from './types.js';
export type { PoolClient } from 'pg';

export class EasyPostgres {
  protected pm: PoolManager;

  constructor(config?: Config) {
    this.pm = new PoolManager(config);
  }

  getConnection(): Promise<PoolClient> {
    return this.pm.getConnection();
  }

  releaseConnection(con: PoolClient | null | undefined): Promise<void> {
    return this.pm.releaseConnection(con);
  }

  close(): Promise<void> {
    return this.pm.close();
  }

  poolStatus(): PoolStatus {
    return this.pm.poolStatus();
  }

  async execSQL<T>(stmt: string, params?: unknown[], con?: PoolClient): Promise<QueryResult<T>> {
    const ownCon = con == null;
    const client = ownCon ? await this.pm.getConnection() : con;
    try {
      const res = await client.query(stmt, params);
      return {
        rowCount: res.rowCount ?? 0,
        rows: res.rows as T[],
        command: res.command,
      };
    } finally {
      if (ownCon) await this.pm.releaseConnection(client);
    }
  }

  // Stubs — filled in by later tasks
  execTransactionSQL<T>(_stmt: string, _params?: unknown[][], _con?: PoolClient): Promise<QueryResult<T>> {
    throw new Error('not yet implemented');
  }

  copyInsert<T>(_stmt: string, _fn: (r: T) => string, _data: T[], _con?: PoolClient): Promise<CopyResult> {
    throw new Error('not yet implemented');
  }

  copyFrom(_stmt: string, _con?: PoolClient): Promise<Readable> {
    throw new Error('not yet implemented');
  }
}

export default EasyPostgres;
