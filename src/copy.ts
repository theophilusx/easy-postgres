import { Readable } from 'node:stream';
import type { PoolClient } from 'pg';
import pgCopyStreams from 'pg-copy-streams';
import { PoolManager } from './pool.js';
import type { CopyResult } from './types.js';
import { CopyError } from './errors.js';

export async function copyInsert<T>(
  pm: PoolManager,
  stmt: string,
  stringifyFn: (record: T) => string,
  data: T[],
  con?: PoolClient
): Promise<CopyResult> {
  let doRelease = false;
  let client = con;
  try {
    if (!client) {
      client = await pm.getConnection();
      doRelease = true;
    }
    const c = client;
    const result = await new Promise<CopyResult>((resolve, reject) => {
      let idx = 0;
      const rs = new Readable({
        encoding: 'utf8',
        read() {
          if (idx === data.length) {
            this.push(null);
          } else {
            this.push(stringifyFn(data[idx++]));
          }
        },
      });
      rs.on('error', (err) =>
        reject(new CopyError(`copyInsert readable error: ${err.message}`, err))
      );
      const stream = c.query(pgCopyStreams.from(stmt));
      stream.on('error', (err) =>
        reject(new CopyError(`copyInsert stream error: ${err.message}`, err))
      );
      stream.on('finish', () => resolve({ rowCount: data.length }));
      rs.pipe(stream);
    });
    return result;
  } catch (err) {
    if (err instanceof CopyError) throw err;
    throw new CopyError(`copyInsert failed: ${(err as Error).message}`, err);
  } finally {
    if (doRelease && client) {
      await pm.releaseConnection(client);
    }
  }
}

// copyFrom will be added in Task 7
export async function copyFrom(
  _pm: PoolManager,
  _stmt: string,
  _con?: PoolClient
): Promise<Readable> {
  throw new Error('copyFrom not yet implemented');
}
