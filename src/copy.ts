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

export async function copyFrom(
  pm: PoolManager,
  stmt: string,
  con?: PoolClient
): Promise<Readable> {
  const doRelease = !con;
  let client = con;
  try {
    if (!client) {
      client = await pm.getConnection();
    }
    const c = client;

    // pg-copy-streams.to() returns a Transform (extends Readable + Writable).
    // We proxy it through a plain Readable so consumers get a clean Readable interface
    // and errors are wrapped as CopyError.
    const pgStream = c.query(pgCopyStreams.to(stmt));
    const output = new Readable({ read() {} });

    pgStream.on('data', (chunk: Buffer) => {
      if (!output.push(chunk)) {
        pgStream.pause();
      }
    });
    output.on('resume', () => pgStream.resume());
    pgStream.on('end', () => output.push(null));
    pgStream.on('error', (err: Error) => {
      // Wrap pg errors as CopyError and destroy the output stream.
      // destroy(err) causes the stream to emit 'error' then 'close'.
      output.destroy(new CopyError(`copyFrom stream error: ${err.message}`, err));
    });

    // Release the connection when the output stream closes.
    // 'close' fires after 'end', after 'error', and after destroy() with no error —
    // it is the only event guaranteed in all termination paths.
    if (doRelease) {
      output.on('close', () => {
        pm.releaseConnection(c).catch(() => {
          // swallow: nothing useful to do with a release error after stream close
        });
        if (!pgStream.destroyed) pgStream.destroy();
      });
    }

    return output;
  } catch (err) {
    if (doRelease && client) {
      await pm.releaseConnection(client).catch(() => {});
    }
    throw new CopyError(`copyFrom setup failed: ${(err as Error).message}`, err);
  }
}
