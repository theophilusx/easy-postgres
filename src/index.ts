import { Readable } from 'node:stream';
import type { PoolClient } from 'pg';
import { PoolManager } from './pool.js';
import type { Config, QueryResult, CopyResult, PoolStatus } from './types.js';
import { execSQL as _execSQL, execTransactionSQL as _execTransactionSQL } from './query.js';
import { copyInsert as _copyInsert, copyFrom as _copyFrom } from './copy.js';

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

  execSQL<T>(stmt: string, params?: unknown[], con?: PoolClient): Promise<QueryResult<T>> {
    return _execSQL<T>(this.pm, stmt, params, con);
  }

  execTransactionSQL<T>(stmt: string, params?: unknown[][], con?: PoolClient): Promise<QueryResult<T>> {
    return _execTransactionSQL<T>(this.pm, stmt, params, con);
  }

  copyInsert<T>(
    stmt: string,
    stringifyFn: (record: T) => string,
    data: T[],
    con?: PoolClient
  ): Promise<CopyResult> {
    return _copyInsert<T>(this.pm, stmt, stringifyFn, data, con);
  }

  copyFrom(stmt: string, con?: PoolClient): Promise<Readable> {
    return _copyFrom(this.pm, stmt, con);
  }
}

export default EasyPostgres;
