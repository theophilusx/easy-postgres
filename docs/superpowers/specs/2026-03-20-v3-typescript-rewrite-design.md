# easy-postgres v3: TypeScript Rewrite Design Spec

**Date:** 2026-03-20
**Version:** 3.0.0 (major bump from 2.0.1)
**Status:** Approved

---

## Overview

A major rewrite of easy-postgres converting the single-file JavaScript library to a
multi-module TypeScript package targeting Node 22 and ESM. The rewrite fixes two confirmed
bugs, introduces a structured error class hierarchy, adds a new `copyFrom()` API for reading
data out of Postgres, and replaces the ad-hoc test setup with a Podman-managed PostgreSQL
container.

---

## Goals

- Convert source to TypeScript with strict mode and full type declarations
- Fix `close()` bug (missing `()` on `this.pool.end`) and dead code in `execSQL()`
- Introduce four typed error subclasses replacing string-prefixed error messages
- Add `copyFrom()` method returning a Node.js `Readable` stream for bulk data export
- Replace `dotenv` with Node 22 native `--env-file` support
- Replace manual local database requirement with a Podman PostgreSQL container
- Ship ESM only, targeting Node 22+
- Bump to version 3.0.0 (breaking changes: ESM only, new error classes)

---

## Non-Goals

- No CommonJS or dual-package build
- No config-based query form (pg object parameter API)
- No new query builder or ORM features

---

## Naming Convention: copy methods

The library uses caller-perspective naming for the two COPY methods:

| Method        | Direction               | PostgreSQL command          |
|---------------|-------------------------|-----------------------------|
| `copyInsert`  | caller → database       | `COPY table FROM STDIN`     |
| `copyFrom`    | database → caller       | `COPY table TO STDOUT`      |

`copyFrom` means "copy data **from** the database into your application". Consumers pass a
`COPY ... TO STDOUT` SQL string.

---

## Architecture

### File Structure

```
easy-postgres/
  src/
    errors.ts        — EasyPostgresError base + four subclasses
    types.ts         — Shared TypeScript interfaces (Config, QueryResult, CopyResult, PoolStatus)
    pool.ts          — Pool wrapper: getConnection, releaseConnection, close, poolStatus
    query.ts         — execSQL, execTransactionSQL, mkResult helper
    copy.ts          — copyInsert (caller → DB), copyFrom (DB → caller stream)
    index.ts         — EasyPostgres class composing all modules; public re-exports
  dist/              — Compiled output (gitignored; published to npm via "files" field)
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
  .mocharc.yml       — Mocha configuration (spec glob, TypeScript loader)
  .env               — Gitignored; created locally from .env.example
  .env.example       — Committed; documents required environment variables
  tsconfig.json      — TypeScript compiler configuration
  package.json       — Updated for v3.0.0, ESM, files whitelist
```

---

## Error Classes

All errors extend a shared base class that preserves the original cause. `QueryError` and
`TransactionError` carry the failing SQL statement in a `.sql` property. The constructor body
must explicitly assign `this.sql` — it is not handled by `super()`.

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
```

**Error-to-method mapping:**

| Error class        | Thrown by                                                       |
|--------------------|-----------------------------------------------------------------|
| `ConnectionError`  | `getConnection`, `releaseConnection`, `close`, pool error event |
| `QueryError`       | `execSQL`                                                       |
| `TransactionError` | `execTransactionSQL`                                            |
| `CopyError`        | `copyInsert`, `copyFrom`                                        |

The `cause` property uses the native Node.js Error cause pattern (Node 22 native support).

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
  appname?: string;             // see Implementation Notes: appname mapping
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
}

export interface QueryResult<T = Record<string, unknown>> {
  rowCount: number;   // sum of all row counts for multi-execution methods
  rows: T[];          // concatenation of all result rows for multi-execution methods
  command: string;    // pg command string from the last execution
}

/**
 * Returned by copyInsert. The COPY protocol does not return rows or a pg command
 * string, so those fields are absent by design.
 */
export interface CopyResult {
  rowCount: number;
}

export interface PoolStatus {
  clientCount: number;    // maps to pg Pool.totalCount
  idleCount: number;      // maps to pg Pool.idleCount
  waitingCount: number;   // maps to pg Pool.waitingCount
}
```

---

## Public API

All public symbols — including error classes, types, and `PoolClient` — are re-exported from
`index.ts`. Subpath imports (e.g. `'easy-postgres/errors'`) are **not** supported; import
everything from `'easy-postgres'`.

```typescript
export type { PoolClient } from 'pg';
export { EasyPostgresError, ConnectionError, QueryError, TransactionError, CopyError } from './errors.js';
export type { Config, QueryResult, CopyResult, PoolStatus } from './types.js';
```

Full class signature:

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
  ): Promise<CopyResult>

  copyFrom(stmt: string, con?: PoolClient): Promise<Readable>
}
```

---

## Method Specifications

### `releaseConnection(con)`

- If `con` is `null` or `undefined`: returns silently (no-op, no error thrown)
- If `con` is a valid `PoolClient`: releases it back to the pool via `con.release()`
- Throws `ConnectionError` if `con.release()` throws
- Note on already-released clients: behaviour is delegated to `pg` — passing a client that
  has already been released may throw or silently degrade depending on `pg` internals; this
  case is not guarded against by the library
- The pool-level error flag (set by the pool's `error` event) is checked after release; if
  set, it is cleared and a `ConnectionError` is thrown

### `execSQL(stmt, params?, con?)`

- Executes a single parameterised SQL statement
- If `con` is omitted: acquires a connection, executes, releases in a `finally` block
- If `con` is provided: uses it and does not release it (caller's responsibility)
- Returns a single `QueryResult<T>`
- Rejects with `QueryError` (with `.sql` set to `stmt`) on execution failure

### `execTransactionSQL(stmt, params?, con?)`

- `stmt`: a single parameterised SQL statement
- `params`: an array of param arrays; each element is one execution of `stmt`
- If `params` is `undefined` or `[]`: issues `BEGIN`/`COMMIT` with zero executions of `stmt`;
  returns `{ rowCount: 0, rows: [], command: '' }` — `command: ''` is a hardcoded sentinel
  for this case; it is not derived from the `BEGIN` or `COMMIT` query results
- Wraps all executions in a single `BEGIN`/`COMMIT` block
- On any failure: issues `ROLLBACK` and rejects with `TransactionError` (`.sql` = `stmt`)
- **Connection lifecycle:**
  - If `con` is omitted: acquires a connection, runs the full transaction, releases in `finally`
  - If `con` is provided: uses it for all executions including `BEGIN`/`COMMIT`/`ROLLBACK`;
    does not release it; caller must not pass a connection already inside an open transaction
- **Return value:** accumulated `QueryResult<T>`:
  - `rowCount` = sum of all individual row counts
  - `rows` = concatenation of all result row arrays, in execution order
  - `command` = `command` string from the final execution

Example:
```typescript
const result = await db.execTransactionSQL(
  'INSERT INTO t (a, b) VALUES ($1, $2)',
  [['foo', 1], ['bar', 2], ['baz', 3]]
);
// result.rowCount === 3
// result.rows === [] (INSERT returns no rows unless RETURNING is used)
// result.command === 'INSERT'
```

### `copyInsert(stmt, stringifyFn, data, con?)`

- `stmt`: a `COPY table FROM STDIN ...` SQL string
- `stringifyFn`: converts one record to the COPY text format expected by `stmt`
- `data`: array of records to insert
- Returns `CopyResult` with `rowCount === data.length`
- Rejects with `CopyError` on stream or pg error

### `copyFrom(stmt, con?)`

- `stmt`: a `COPY table TO STDOUT ...` SQL string (data flows database → caller)
- Returns a Node.js `Readable` stream in **paused (non-flowing) mode**, not object mode
- Each chunk is a raw `Buffer` as emitted by `pg-copy-streams`
- **Connection lifecycle:**
  - If `con` is omitted: acquires a connection; releases it automatically when the stream
    emits `close` (which fires after `end`, after `error`, and after `destroy()`)
  - If `con` is provided: does not release it; caller is responsible for release after the
    stream ends
- **Important:** callers must always consume, pipe, or explicitly `destroy()` the stream.
  If the returned stream is dropped without being read or destroyed, `close` will never fire
  and the connection will leak (when `con` was auto-acquired)
- The implementation must listen on the `close` event (not `end` or `error`) for connection
  release — `close` is the only event guaranteed to fire in all termination paths including
  `stream.destroy()` with no argument
- Rejects the returned `Promise` with `CopyError` if stream setup fails before data flows
- Runtime errors mid-stream (network drop, server error) are emitted as `CopyError`
  instances on the stream's `error` event (followed by `close`)
- Consumption patterns:

```typescript
// Async iteration (recommended)
const stream = await db.copyFrom('COPY my_table TO STDOUT (FORMAT csv)');
for await (const chunk of stream) {
  process.stdout.write(chunk); // chunk is a Buffer
}

// Pipe to a writable
const stream = await db.copyFrom('COPY my_table TO STDOUT');
stream.pipe(fs.createWriteStream('output.txt'));
```

### Bug fixes

- `close()`: `await this.pool.end()` — parentheses restored; pool now correctly closes
- `execSQL()`: dead `if/else` with identical branches collapsed to `con.query(stmt, params)`

---

## Implementation Notes

### `appname` → `application_name` mapping

`pg.Pool` uses `application_name` (snake_case). `Config` exposes `appname` for a cleaner
user-facing API. The translation must guard against `undefined` to avoid shadowing the
`PGAPPNAME` environment variable:

```typescript
const { appname, ...rest } = config;
const pool = new Pool({
  ...rest,
  ...(appname !== undefined && { application_name: appname }),
});
```

If `appname` is not provided in `Config`, `pg` reads `PGAPPNAME` from the environment
automatically. If `appname` is provided, it takes precedence.

### `poolStatus()` property mapping

| `PoolStatus` field | `pg.Pool` property  |
|--------------------|---------------------|
| `clientCount`      | `pool.totalCount`   |
| `idleCount`        | `pool.idleCount`    |
| `waitingCount`     | `pool.waitingCount` |

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

All public symbols are exported from the `"."` entry point. Subpath exports are not provided.

### Dependency changes

| Action  | Package                   | Type    | Notes                                      |
|---------|---------------------------|---------|--------------------------------------------|
| Remove  | `dotenv`                  | devDep  |                                            |
| Remove  | `chai-as-promised`        | devDep  | Chai 5 supports async assertions natively  |
| Add     | `typescript`              | devDep  |                                            |
| Add     | `@types/node`             | devDep  |                                            |
| Add     | `@types/pg`               | devDep  |                                            |
| Add     | `@types/pg-copy-streams`  | devDep  |                                            |
| Add     | `tsx`                     | devDep  |                                            |
| Bump    | `mocha` 8 → 11            | devDep  |                                            |
| Bump    | `chai` 4 → 5              | devDep  |                                            |
| Keep    | `pg`, `pg-copy-streams`   | dep     |                                            |

Existing test files that use `chai-as-promised` (`chai.use(chaiAsPromised)`) must have that
setup removed. Tests that previously used `.to.be.rejectedWith(...)` should be rewritten
using native `async/await` with `try/catch` and standard `expect` assertions.

### `.npmignore`

Removed. The `"files"` field in `package.json` serves as the whitelist. npm publishes only:
`dist/`, `README.md`, `LICENSE`, and `package.json` (always included automatically).

---

## Testing Infrastructure

### Mocha configuration

**`.mocharc.yml`:**
```yaml
spec: test/**/*.ts
import: tsx/esm
timeout: 10000
```

`tsx/esm` is the ESM loader for `tsx`, which handles TypeScript files without a separate
compile step. It is registered via `--import` (Mocha 11 ESM hook), not `--require`.
Timeout is raised to 10 000 ms to accommodate real database round-trips.

### Podman PostgreSQL container

**`package.json` scripts:**

```json
"scripts": {
  "build": "tsc",
  "db:clean": "podman stop easy-postgres-test 2>/dev/null || true; podman rm easy-postgres-test 2>/dev/null || true",
  "db:start": "podman run -d --name easy-postgres-test -e POSTGRES_USER=tim -e POSTGRES_PASSWORD=testpassword -e POSTGRES_DB=playground -p 5432:5432 --health-cmd 'pg_isready -U tim' --health-interval 2s --health-start-period 10s docker.io/postgres:17",
  "db:stop": "podman stop easy-postgres-test && podman rm easy-postgres-test",
  "db:wait": "until podman healthcheck run easy-postgres-test; do sleep 1; done",
  "pretest": "npm run db:clean && npm run db:start && npm run db:wait",
  "test": "NODE_OPTIONS='--env-file=.env' mocha; EXIT=$?; npm run db:stop; exit $EXIT"
}
```

Notes:
- `NODE_OPTIONS='--env-file=.env'` passes the Node 22 env-file flag through Mocha's spawned
  Node process; this avoids the `node_modules/.bin/mocha` shebang-script problem with direct
  `node` invocation
- The `test` script captures Mocha's exit code (`EXIT=$?`, POSIX-compatible), runs `db:stop`
  unconditionally, then exits with the original code, ensuring cleanup on both pass and fail
- `posttest` is not used for `db:stop` — though npm does run `posttest` after a non-zero
  `test` exit, embedding cleanup in `test` is more explicit and resistant to edge cases
  (e.g. `--bail`, script-level `exit` calls)
- `--health-start-period 10s` prevents false-healthy signals before PostgreSQL finishes init
- `|| true` in `db:clean` is POSIX-portable; prevents failure when no container exists
- `db:start`, `db:stop`, `db:wait`, `db:clean` are available as standalone development commands

### Environment variables

- `.env` is gitignored; developers copy `.env.example` and fill in values
- `NODE_OPTIONS='--env-file=.env'` in the test script loads it via Node 22 natively

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

| File              | Additions                                                                          |
|-------------------|------------------------------------------------------------------------------------|
| `00connect.ts`    | Invalid credentials → `ConnectionError`; `poolStatus()` field assertions          |
| `01execSQL.ts`    | Bad SQL → `QueryError` with `.sql` property; failed transaction → `TransactionError` with rollback verification; `execTransactionSQL` with empty params; accumulated result shape |
| `02copyInsert.ts` | Malformed data → `CopyError`; empty `data` array edge case                        |

**New test files:**

| File            | Coverage                                                                           |
|-----------------|------------------------------------------------------------------------------------|
| `03copyFrom.ts` | Happy path async iteration; clean stream close; mid-stream error → `CopyError` on `error` event; invalid stmt → Promise rejection with `CopyError` |
| `04errors.ts`   | `instanceof` per subclass; `err.name` matches class name; `.sql` on `QueryError`/`TransactionError`; `cause` preserved; `releaseConnection(null)` is a no-op |

---

## Breaking Changes from v2

1. **ESM only** — `require('easy-postgres')` no longer works; use `import`
2. **Error classes** — methods reject with typed subclasses of `EasyPostgresError` instead
   of plain `Error`; code testing `err.message` prefix strings must be updated
3. **Node 22+ required** — older Node versions are not supported

### Migration: error handling

**v2 pattern:**
```javascript
try {
  await db.execSQL('SELECT ...');
} catch (err) {
  if (err.message.startsWith('execSQL:')) { /* handle query error */ }
}
```

**v3 pattern:**
```typescript
import { QueryError } from 'easy-postgres';

try {
  await db.execSQL('SELECT ...');
} catch (err) {
  if (err instanceof QueryError) {
    console.error('Query failed:', err.sql, err.cause);
  }
}
```

## Bug Fixes (not breaking for correct usage)

- **`close()` now works** — the v2 `close()` was a silent no-op due to a missing `()`.
  Code that never called `close()` is unaffected. Code that called `close()` and then
  continued using the pool was relying on broken behaviour and must be reviewed.
