# easy-postgres

Thin async wrapper around [`pg`](https://node-postgres.com/) and [`pg-copy-streams`](https://github.com/brianc/node-pg-copy-streams). ESM-only, ships TypeScript declarations (`.d.ts`), manages a connection pool internally, exposes typed error classes, and provides a Promise/async API throughout.

## Requirements

- Node 22+ (uses native `--env-file` — no dotenv needed)
- PostgreSQL (tested against v17)
- ESM-only — consumers must use `"type": "module"` in `package.json` or use `.mjs` imports

## Installation

```sh
npm i easy-postgres
```

## Configuration

### Environment variables

Create a `.env` file with the standard libpq connection variables:

```env
PGUSER=myuser
PGPASSWORD=mypassword
PGHOST=localhost
PGDATABASE=mydb
PGPORT=5432
```

Load it with Node's built-in env-file support (Node 22+):

```sh
node --env-file=.env yourscript.js
```

Constructing `new EasyPostgres()` with no arguments reads connection details from the environment.

### Config object

Pass a `Config` object to the constructor to set connection details programmatically:

```typescript
interface Config {
  user?: string;
  password?: string;
  host?: string;
  database?: string;
  port?: number;
  appname?: string;             // maps to application_name
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
  ssl?: boolean | object;       // e.g. true, or { rejectUnauthorized: false }
}
```

```typescript
import EasyPostgres from 'easy-postgres';

const db = new EasyPostgres({
  host: 'localhost',
  database: 'mydb',
  user: 'myuser',
  password: 'mypassword',
  port: 5432,
  max: 10,
});
```

## Quick Start

```typescript
import EasyPostgres from 'easy-postgres';               // default export
import { EasyPostgres } from 'easy-postgres';            // also valid — named export
```

```typescript
import EasyPostgres, { QueryError } from 'easy-postgres';

const db = new EasyPostgres(); // reads from environment

try {
  const result = await db.execSQL<{ id: number; name: string }>(
    'SELECT id, name FROM users WHERE active = $1',
    [true]
  );
  console.log(result.rows);
} catch (err) {
  if (err instanceof QueryError) {
    console.error('Query failed:', err.message, 'SQL:', err.sql);
  }
} finally {
  await db.close();
}
```

## API Reference

### Return Types

**`QueryResult<T>`**

```typescript
interface QueryResult<T> {
  rowCount: number;       // rows affected or returned
  rows: T[];              // result rows (empty for DDL/DML)
  command: string | null; // pg command tag e.g. "SELECT", "INSERT", "UPDATE"; null when no execution occurred
}
```

**`CopyResult`**

```typescript
interface CopyResult {
  rowCount: number;   // equals data.length (the input array size) — the COPY protocol does not return a server-confirmed count, rows, or command tag
}
```

**`PoolStatus`**

```typescript
interface PoolStatus {
  clientCount: number;    // total connections currently open
  idleCount: number;      // connections idle and available
  waitingCount: number;   // requests queued waiting for a connection
}
```

---

### `execSQL<T>(stmt, params?, con?)`

```typescript
execSQL<T>(stmt: string, params?: unknown[], con?: PoolClient): Promise<QueryResult<T>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `stmt` | `string` | SQL statement |
| `params` | `unknown[]` | Optional positional parameters (`$1`, `$2`, …) |
| `con` | `PoolClient` | Optional connection — caller is responsible for releasing it |

Returns `QueryResult<T>`. For DDL statements, `rows` is empty and `rowCount` is 0.

**DDL — create table:**

```typescript
await db.execSQL(`
  CREATE TABLE IF NOT EXISTS events (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  )
`);
```

**DML — insert:**

```typescript
const result = await db.execSQL(
  'INSERT INTO events (name) VALUES ($1)',
  ['user.signup']
);
console.log(result.rowCount); // 1
```

**DQL — select:**

```typescript
const result = await db.execSQL<{ id: number; name: string }>(
  'SELECT id, name FROM events WHERE name = $1',
  ['user.signup']
);
console.log(result.rows); // [{ id: 1, name: 'user.signup' }]
```

---

### `execTransactionSQL<T>(stmt, params?, con?)`

```typescript
execTransactionSQL<T>(stmt: string, params?: unknown[][], con?: PoolClient): Promise<QueryResult<T>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `stmt` | `string` | SQL statement executed once per inner `params` array |
| `params` | `unknown[][]` | Array of arrays — one per execution |
| `con` | `PoolClient` | Optional connection — caller is responsible for releasing it |

Runs all executions inside a single `BEGIN`/`COMMIT` block. Returns accumulated `rowCount` and `rows` across all executions. `command` reflects the pg command tag from the **last** execution.

Edge case: an empty `params` array (`[]`) commits immediately and returns `{ rowCount: 0, rows: [], command: null }` — `null` indicates no statement was executed.

**Batch update:**

```typescript
const result = await db.execTransactionSQL(
  'UPDATE events SET name = $1 WHERE id = $2',
  [
    ['user.login', 1],
    ['user.logout', 2],
    ['user.signup', 3],
  ]
);
console.log(result.rowCount); // 3
console.log(result.command);  // "UPDATE"
```

---

### `execTransaction<T>(callback, con?)`

```typescript
execTransaction<T>(callback: (con: PoolClient) => Promise<T>, con?: PoolClient): Promise<T>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `callback` | `(con: PoolClient) => Promise<T>` | Async function receiving the transaction connection |
| `con` | `PoolClient` | Optional connection — caller is responsible for releasing it |

Runs `callback` inside a single `BEGIN`/`COMMIT` block. The connection is passed into `callback` so all statements in the callback share the same transaction. On any error, the transaction is rolled back and the original error is rethrown unchanged.

Returns whatever `callback` returns.

Use this when a transaction needs **multiple different SQL statements** (different statements, or a mix of reads and writes). Use `execTransactionSQL` when you need to execute the **same statement with many different parameter sets**.

**Multi-statement transaction:**

```typescript
const order = await db.execTransaction(async (con) => {
  const { rows: [order] } = await db.execSQL<{ id: number }>(
    'INSERT INTO orders (user_id) VALUES ($1) RETURNING id',
    [userId],
    con
  );
  await db.execSQL(
    'INSERT INTO order_items (order_id, product_id, qty) VALUES ($1, $2, $3)',
    [order.id, productId, qty],
    con
  );
  return order;
});
console.log(order.id);
```

---

### `copyInsert<T>(stmt, stringifyFn, data, con?)`

```typescript
copyInsert<T>(
  stmt: string,
  stringifyFn: (record: T) => string,
  data: T[],
  con?: PoolClient
): Promise<CopyResult>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `stmt` | `string` | `COPY … FROM STDIN` statement |
| `stringifyFn` | `(record: T) => string` | Converts each record to a line of COPY input |
| `data` | `T[]` | Records to insert |
| `con` | `PoolClient` | Optional connection — caller is responsible for releasing it |

Returns `CopyResult` — only `rowCount` (equals `data.length`). The COPY protocol does not return rows or a command tag.

> **Security:** The `stmt` string is sent verbatim to PostgreSQL — it is not parameterized. Never construct `stmt` from untrusted input (e.g. user-supplied table names). Hardcode the statement or validate all dynamic parts before calling `copyInsert`.

**Tab-delimited bulk insert:**

```typescript
interface Event { id: number; name: string }

const result = await db.copyInsert<Event>(
  'COPY events (id, name) FROM STDIN',
  (record) => `${record.id}\t${record.name}`,
  [
    { id: 10, name: 'page.view' },
    { id: 11, name: 'page.exit' },
  ]
);
console.log(result.rowCount); // 2
```

---

### `copyFrom(stmt, con?)`

```typescript
copyFrom(stmt: string, con?: PoolClient): Promise<Readable>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `stmt` | `string` | `COPY … TO STDOUT` statement |
| `con` | `PoolClient` | Optional connection; if omitted, released automatically when the stream closes |

Returns `Promise<Readable>`. There are two distinct error paths:

1. **Setup errors** (e.g. connection failure before the stream is created): `copyFrom` returns a **rejected promise** — wrap the `await copyFrom(…)` call in try/catch.
2. **Streaming errors** (errors from the underlying pipe after the stream is returned): surfaced as a stream `error` event on the returned `Readable` — attach an `error` listener.

When no `con` is passed, the connection is automatically released when the output stream emits `close`. The `close` event is guaranteed across all termination paths — normal end, streaming error, and explicit destroy — so auto-release covers the error path too.

**Export via pipe:**

```typescript
import { createWriteStream } from 'node:fs';

let readable: Readable;
try {
  readable = await db.copyFrom('COPY events TO STDOUT');
} catch (err) {
  // Setup error (CopyError) — stream was never created
  console.error('Failed to start COPY:', err);
  process.exit(1);
}

readable.on('error', (err) => {
  // Streaming error after stream was returned
  console.error('Stream error:', err);
});

const out = createWriteStream('events.tsv');
readable.pipe(out);
```

---

### `getConnection()` / `releaseConnection(con)`

```typescript
getConnection(): Promise<PoolClient>
releaseConnection(con: PoolClient | null | undefined): Promise<void>
```

Acquire and release a connection manually. Use when multiple statements must share a session (e.g. temp tables, advisory locks).

`releaseConnection` accepts `null | undefined` and is a no-op in those cases — safe to call unconditionally in a `finally` block.

> **Warning:** `releaseConnection` can throw `ConnectionError` if the underlying pool operation fails. A throw from a `finally` block will swallow the original error. Wrap `releaseConnection` in its own try/catch inside `finally` if this matters.

**Manual session — temp table across two statements:**

```typescript
import { ConnectionError } from 'easy-postgres';

let con;
try {
  con = await db.getConnection();

  await db.execSQL('CREATE TEMP TABLE tmp_ids (id INT)', [], con);
  await db.execSQL('INSERT INTO tmp_ids VALUES ($1)', [42], con);

  const result = await db.execSQL<{ id: number }>(
    'SELECT id FROM tmp_ids',
    [],
    con
  );
  console.log(result.rows); // [{ id: 42 }]
} finally {
  try {
    await db.releaseConnection(con);
  } catch (err) {
    if (err instanceof ConnectionError) {
      console.error('Release failed:', err);
    }
  }
}
```

---

### `close()` / `poolStatus()`

```typescript
close(): Promise<void>
poolStatus(): PoolStatus
```

- **`close()`** — drains and ends the pool. Throws `ConnectionError` on failure. After calling `close()`, the instance cannot be reused.
- **`poolStatus()`** — synchronous snapshot of the pool state. Returns `PoolStatus`.

```typescript
const status = db.poolStatus();
console.log(status.clientCount, status.idleCount, status.waitingCount);

await db.close();
```

---

## Error Classes

All error classes are named exports from `easy-postgres`. `instanceof` checks work correctly across the full hierarchy.

| Class | Extends | Extra Properties | When Thrown |
|-------|---------|-----------------|-------------|
| `EasyPostgresError` | `Error` | `cause?: unknown` | Base class — never thrown directly |
| `ConnectionError` | `EasyPostgresError` | — | Pool/connection failures (`getConnection`, `releaseConnection`, `close`) |
| `QueryError` | `EasyPostgresError` | `sql: string` | `execSQL` failures |
| `TransactionError` | `EasyPostgresError` | `sql: string` | `execTransactionSQL` failures |
| *(callback's error)* | — | — | `execTransaction` re-throws whatever the callback throws, unchanged |
| `CopyError` | `EasyPostgresError` | — | `copyInsert` failures; `copyFrom` setup failures; `copyFrom` stream errors |

```typescript
import {
  EasyPostgresError,
  ConnectionError,
  QueryError,
  TransactionError,
  CopyError,
} from 'easy-postgres';
```

## Version History

- **v3.0.0** — ESM/TypeScript rewrite; typed errors; `copyFrom`; Node 22+
- **v2.0.0** — previous CJS version
