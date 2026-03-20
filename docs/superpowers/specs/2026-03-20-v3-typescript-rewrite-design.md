# easy-postgres v3: TypeScript Rewrite Design Spec

**Date:** 2026-03-20
**Version:** 3.0.0 (major bump from 2.0.1)
**Status:** Approved

---

## Overview

A major rewrite of easy-postgres converting the single-file JavaScript library to a multi-module TypeScript package targeting Node 22 and ESM. The rewrite fixes two confirmed bugs, introduces a structured error class hierarchy, adds a new `copyFrom()` API, and replaces the ad-hoc test setup with a Podman-managed PostgreSQL container.

---

## Goals

- Convert source to TypeScript with strict mode and full type declarations
- Fix `close()` bug (missing `()` on `this.pool.end`) and dead code in `execSQL()`
- Introduce four typed error subclasses replacing string-prefixed error messages
- Add `copyFrom()` method returning a Node.js `Readable` stream
- Replace `dotenv` with Node 22 native `--env-file` support
- Replace manual local database requirement with a Podman PostgreSQL container
- Ship ESM only, targeting Node 22+
- Bump to version 3.0.0 (breaking changes: ESM only, new error classes, new API)

---

## Non-Goals

- No CommonJS or dual-package build
- No COPY FROM support beyond the new `copyFrom()` stream method
- No config-based query form (pg object parameter API)
- No new query builder or ORM features

---

## Architecture

### File Structure

```
easy-postgres/
  src/
    errors.ts        — EasyPostgresError base + four subclasses
    types.ts         — Shared TypeScript interfaces (Config, QueryResult, PoolStatus)
    pool.ts          — Pool wrapper: getConnection, releaseConnection, close, poolStatus
    query.ts         — execSQL, execTransactionSQL, mkResult helper
    copy.ts          — copyInsert (COPY TO Postgres), copyFrom (COPY FROM Postgres → Readable)
    index.ts         — EasyPostgres class composing all modules; public re-exports
  dist/              — Compiled output (gitignored, not on npm)
  test/
    00connect.ts     — Connection tests (extended with error cases, poolStatus)
    01execSQL.ts     — execSQL and execTransactionSQL tests (extended with error cases)
    02copyInsert.ts  — copyInsert tests (extended with edge cases)
    03copyFrom.ts    — New: copyFrom stream tests
    04errors.ts      — New: error class contract tests
  docs/
    superpowers/
      specs/
        2026-03-20-v3-typescript-rewrite-design.md
  .env               — Gitignored; created locally from .env.example
  .env.example       — Committed; documents required environment variables
  tsconfig.json      — TypeScript compiler configuration
  package.json       — Updated for v3.0.0, ESM, files whitelist
```

---

## Error Classes

All errors extend a shared base class that preserves the original cause.

```typescript
// src/errors.ts
export class EasyPostgresError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ConnectionError extends EasyPostgresError {}

export class QueryError extends EasyPostgresError {
  constructor(message: string, public readonly sql: string, cause?: unknown) {
    super(message, cause);
  }
}

export class TransactionError extends EasyPostgresError {
  constructor(message: string, public readonly sql: string, cause?: unknown) {
    super(message, cause);
  }
}

export class CopyError extends EasyPostgresError {}
```

**Error-to-method mapping:**

| Error class        | Thrown by                                          |
|--------------------|----------------------------------------------------|
| `ConnectionError`  | `getConnection`, `releaseConnection`, `close`, pool error event |
| `QueryError`       | `execSQL`                                          |
| `TransactionError` | `execTransactionSQL`                               |
| `CopyError`        | `copyInsert`, `copyFrom`                           |

`QueryError` and `TransactionError` carry the `.sql` property (the statement that failed) to aid debugging. The `cause` property uses the native Node.js Error cause pattern.

---

## Shared Types

```typescript
// src/types.ts
export interface Config {
  user?: string;
  password?: string;
  host?: string;
  database?: string;
  port?: number;
  appname?: string;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
}

export interface QueryResult<T = Record<string, unknown>> {
  rowCount: number;
  rows: T[];
  command: string;
}

export interface PoolStatus {
  clientCount: number;
  idleCount: number;
  waitingCount: number;
}
```

---

## Public API

```typescript
class EasyPostgres {
  constructor(config?: Config)

  // Connection management
  getConnection(): Promise<PoolClient>
  releaseConnection(con: PoolClient | null | undefined): Promise<void>
  close(): Promise<void>
  poolStatus(): PoolStatus

  // Query execution
  execSQL<T>(stmt: string, params?: unknown[], con?: PoolClient): Promise<QueryResult<T>>
  execTransactionSQL<T>(stmt: string, params?: unknown[][], con?: PoolClient): Promise<QueryResult<T>>

  // Bulk data
  copyInsert<T>(
    stmt: string,
    stringifyFn: (record: T) => string,
    data: T[],
    con?: PoolClient
  ): Promise<{ rowCount: number }>

  copyFrom(stmt: string, con?: PoolClient): Promise<Readable>
}
```

### `copyFrom()` behaviour

- `stmt` is a `COPY table TO STDOUT ...` SQL string
- Returns a Node.js `Readable` stream; each chunk is a raw `Buffer`
- The stream manages its own connection lifecycle: acquires one if not provided, releases automatically on stream `end` or `error`
- Caller consumes via pipe or async iteration: `for await (const chunk of stream)`
- Throws `CopyError` if the COPY statement is invalid or stream setup fails

### Bug fixes

- `close()`: `await this.pool.end()` — parentheses restored; pool now actually closes
- `execSQL()`: dead `if/else` with identical branches collapsed to a single `con.query(stmt, params)`

---

## Build Configuration

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": false,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

### `package.json` key changes

```json
{
  "name": "easy-postgres",
  "version": "3.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "README.md", "LICENSE"]
}
```

### Dependency changes

| Action  | Package                   | Type    |
|---------|---------------------------|---------|
| Remove  | `dotenv`                  | devDep  |
| Add     | `typescript`              | devDep  |
| Add     | `@types/node`             | devDep  |
| Add     | `@types/pg`               | devDep  |
| Add     | `@types/pg-copy-streams`  | devDep  |
| Add     | `tsx`                     | devDep  |
| Bump    | `mocha` 8 → 11            | devDep  |
| Bump    | `chai` 4 → 5              | devDep  |
| Keep    | `pg`, `pg-copy-streams`   | dep     |

### `.npmignore`

Removed. The `"files"` field in `package.json` serves as the whitelist and supersedes `.npmignore`. npm will publish only: `dist/`, `README.md`, `LICENSE`, and `package.json` (always included automatically).

---

## Testing Infrastructure

### Podman PostgreSQL container

Tests require a local PostgreSQL instance managed via Podman. The container lifecycle is automated via npm scripts.

**`package.json` scripts:**

```json
"scripts": {
  "build": "tsc",
  "db:clean": "podman stop easy-postgres-test 2>/dev/null; podman rm easy-postgres-test 2>/dev/null; exit 0",
  "db:start": "podman run -d --name easy-postgres-test -e POSTGRES_USER=tim -e POSTGRES_PASSWORD=testpassword -e POSTGRES_DB=playground -p 5432:5432 --health-cmd 'pg_isready -U tim' --health-interval 2s docker.io/postgres:17",
  "db:stop": "podman stop easy-postgres-test && podman rm easy-postgres-test",
  "db:wait": "until podman healthcheck run easy-postgres-test; do sleep 1; done",
  "pretest": "npm run db:clean && npm run db:start && npm run db:wait",
  "posttest": "npm run db:stop",
  "test": "mocha --env-file=.env"
}
```

- `pretest` always cleans up stale containers before starting a fresh one
- `posttest` always tears down after the test run (including on failure, as npm always runs `posttest`)
- `db:start`, `db:stop`, `db:wait`, `db:clean` are also available as standalone commands for manual use

### Environment variables

- `.env` is gitignored; developers copy `.env.example` and fill in credentials
- `.env.example` is committed and documents all required variables
- Node 22 `--env-file=.env` flag loads the file natively; no `dotenv` package needed

**`.env.example`:**

```
PGUSER=
PGPASSWORD=
PGHOST=localhost
PGDATABASE=playground
PGPORT=5432
PGAPPNAME=easy-postgres-test
```

### Test coverage

**Existing tests (converted + extended):**

| File              | Additions                                                                 |
|-------------------|---------------------------------------------------------------------------|
| `00connect.ts`    | Invalid credentials → `ConnectionError`; `poolStatus()` assertions       |
| `01execSQL.ts`    | Bad SQL → `QueryError` with `.sql` property; failed transaction → `TransactionError` with rollback verification |
| `02copyInsert.ts` | Malformed data → `CopyError`; empty array edge case                      |

**New test files:**

| File           | Coverage                                                                 |
|----------------|--------------------------------------------------------------------------|
| `03copyFrom.ts`| Happy path stream consumption; clean stream close; invalid stmt → `CopyError` |
| `04errors.ts`  | `instanceof` checks per subclass; `err.name` matches class name; `.sql` property on `QueryError`/`TransactionError`; `cause` preserved on all types |

---

## Breaking Changes from v2

1. **ESM only** — `require('easy-postgres')` no longer works
2. **Error classes** — methods now throw typed errors (`ConnectionError`, `QueryError`, etc.) instead of plain `Error` with string prefixes; any code catching and inspecting `err.message` prefixes will break
3. **Node 22+ required** — drops support for older Node versions
4. **`close()` actually closes** — previously the bug meant `close()` was a no-op; code that relied on the pool remaining open after `close()` will now behave differently
