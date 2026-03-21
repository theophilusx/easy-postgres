import pg from 'pg';
import type { Pool as PgPool, PoolClient } from 'pg';
const { Pool } = pg;
import { Config, PoolStatus } from './types.js';
import { ConnectionError } from './errors.js';

export class PoolManager {
  private pool: PgPool;
  private poolError: Error | null = null;

  constructor(config?: Config) {
    if (config) {
      const { appname, ...rest } = config;
      this.pool = new Pool({
        ...rest,
        ...(appname !== undefined && { application_name: appname }),
      });
    } else {
      this.pool = new Pool();
    }
    this.pool.on('error', (err: Error) => {
      this.poolError = err;
    });
  }

  async getConnection(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      if (this.poolError) {
        const e = this.poolError;
        this.poolError = null;
        throw e;
      }
      return client;
    } catch (err) {
      throw new ConnectionError(
        `getConnection failed: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }
  }

  async releaseConnection(con: PoolClient | null | undefined): Promise<void> {
    if (con == null) return;
    try {
      await con.release();
      if (this.poolError) {
        const e = this.poolError;
        this.poolError = null;
        throw e;
      }
    } catch (err) {
      throw new ConnectionError(
        `releaseConnection failed: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
      if (this.poolError) {
        const e = this.poolError;
        this.poolError = null;
        throw e;
      }
    } catch (err) {
      throw new ConnectionError(
        `close failed: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }
  }

  poolStatus(): PoolStatus {
    return {
      clientCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}
