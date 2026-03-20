export class EasyPostgresError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ConnectionError extends EasyPostgresError {}

export class QueryError extends EasyPostgresError {
  public readonly sql: string;
  constructor(message: string, sql: string, cause?: unknown) {
    super(message, cause);
    this.sql = sql;
  }
}

export class TransactionError extends EasyPostgresError {
  public readonly sql: string;
  constructor(message: string, sql: string, cause?: unknown) {
    super(message, cause);
    this.sql = sql;
  }
}

export class CopyError extends EasyPostgresError {}
