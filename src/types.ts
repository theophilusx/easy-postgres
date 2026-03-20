export interface Config {
  user?: string;
  password?: string;
  host?: string;
  database?: string;
  port?: number;
  /** Maps to pg's `application_name`. See pool.ts for the translation. */
  appname?: string;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
}

export interface QueryResult<T = Record<string, unknown>> {
  /** Sum of all row counts for multi-execution methods. */
  rowCount: number;
  /** Concatenation of all result rows for multi-execution methods. */
  rows: T[];
  /** pg command string from the last execution. */
  command: string;
}

/**
 * Returned by copyInsert. The COPY protocol does not return rows or a command
 * string, so those fields are absent by design.
 */
export interface CopyResult {
  rowCount: number;
}

export interface PoolStatus {
  /** Maps to pg Pool.totalCount */
  clientCount: number;
  /** Maps to pg Pool.idleCount */
  idleCount: number;
  /** Maps to pg Pool.waitingCount */
  waitingCount: number;
}
