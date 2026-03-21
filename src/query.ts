import type { PoolClient } from 'pg';
import { PoolManager } from './pool.js';
import type { QueryResult } from './types.js';
import { QueryError, TransactionError } from './errors.js';

export async function execTransaction<T>(
  pm: PoolManager,
  callback: (con: PoolClient) => Promise<T>,
  con?: PoolClient
): Promise<T> {
  const doRelease = !con;
  let client = con;
  try {
    if (!client) {
      client = await pm.getConnection();
    }
    await client.query('BEGIN');
    try {
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // swallow rollback errors — the original error is more important
      }
      throw err;
    }
  } finally {
    if (doRelease && client) {
      await pm.releaseConnection(client);
    }
  }
}

function mkResult<T>(
  rslt: { rowCount: number; rows: T[]; command: string },
  accRslt: QueryResult<T> | null
): QueryResult<T> {
  if (!accRslt) {
    return { rowCount: rslt.rowCount, rows: [...rslt.rows], command: rslt.command };
  }
  return {
    rowCount: accRslt.rowCount + rslt.rowCount,
    rows: [...accRslt.rows, ...rslt.rows],
    command: rslt.command,
  };
}

export async function execSQL<T>(
  pm: PoolManager,
  stmt: string,
  params: unknown[] = [],
  con?: PoolClient
): Promise<QueryResult<T>> {
  let doRelease = false;
  let client = con;
  try {
    if (!client) {
      client = await pm.getConnection();
      doRelease = true;
    }
    const rslt = await client.query(stmt, params);
    return { rowCount: rslt.rowCount ?? 0, rows: rslt.rows as T[], command: rslt.command };
  } catch (err) {
    throw new QueryError(`execSQL failed: ${err instanceof Error ? err.message : String(err)}`, stmt, err);
  } finally {
    if (doRelease && client) {
      await pm.releaseConnection(client);
    }
  }
}

export async function execTransactionSQL<T>(
  pm: PoolManager,
  stmt: string,
  params: unknown[][] = [],
  con?: PoolClient
): Promise<QueryResult<T>> {
  let doRelease = false;
  let client = con;
  try {
    if (!client) {
      client = await pm.getConnection();
      doRelease = true;
    }
    await client.query('BEGIN');
    if (params.length === 0) {
      await client.query('COMMIT');
      return { rowCount: 0, rows: [], command: null };
    }
    let result: QueryResult<T> | null = null;
    for (const p of params) {
      const rslt = await client.query(stmt, p);
      result = mkResult<T>(
        { rowCount: rslt.rowCount ?? 0, rows: rslt.rows as T[], command: rslt.command },
        result
      );
    }
    await client.query('COMMIT');
    return result!;
  } catch (err) {
    try {
      if (client) await client.query('ROLLBACK');
    } catch {
      // swallow rollback errors — the original error is more important
    }
    throw new TransactionError(
      `execTransactionSQL failed: ${err instanceof Error ? err.message : String(err)}`,
      stmt,
      err
    );
  } finally {
    if (doRelease && client) {
      await pm.releaseConnection(client);
    }
  }
}
