# easy-postgres v3 TypeScript Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite easy-postgres from a single-file JavaScript library to a multi-module TypeScript ESM package targeting Node 22, fixing two bugs, introducing typed error classes, and adding a `copyFrom()` streaming API.

**Architecture:** The monolithic `src/index.js` is split into five focused modules (`errors`, `types`, `pool`, `query`, `copy`) each with a single responsibility. A new `EasyPostgres` class in `src/index.ts` composes them. Tests are TypeScript, run via `tsx/esm` loader in Mocha 11, against a Podman-managed PostgreSQL 17 container.

**Tech Stack:** TypeScript 5, Node 22, ESM (NodeNext), pg, pg-copy-streams, Mocha 11, Chai 5, tsx, Podman, PostgreSQL 17

**Spec:** `docs/superpowers/specs/2026-03-20-v3-typescript-rewrite-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Version 3.0.0, ESM, scripts, deps |
| `tsconfig.json` | Create | TypeScript compiler config |
| `.mocharc.yml` | Create | Mocha test runner config |
| `.env.example` | Create | Committed env template |
| `.gitignore` | Modify | Add `dist/` |
| `.npmignore` | Delete | Replaced by `"files"` in package.json |
| `src/errors.ts` | Create | EasyPostgresError + 4 subclasses |
| `src/types.ts` | Create | Config, QueryResult, CopyResult, PoolStatus |
| `src/pool.ts` | Create | PoolManager: connection lifecycle |
| `src/query.ts` | Create | execSQL, execTransactionSQL, mkResult |
| `src/copy.ts` | Create | copyInsert, copyFrom |
| `src/index.ts` | Create | EasyPostgres class + all public re-exports |
| `src/index.js` | Delete | Replaced by TypeScript modules |
| `test/00connect.ts` | Create | Connection + poolStatus tests |
| `test/01execSQL.ts` | Create | execSQL + execTransactionSQL tests |
| `test/02copyInsert.ts` | Create | copyInsert tests |
| `test/03copyFrom.ts` | Create | copyFrom stream tests |
| `test/04errors.ts` | Create | Error class contract tests |
| `test/00connect.js` | Delete | Replaced by .ts |
| `test/01execSQL.js` | Delete | Replaced by .ts |
| `test/02copyInsert.js` | Delete | Replaced by .ts |

---

## Task 1: Project Scaffolding

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `.mocharc.yml`
- Create: `.env.example`
- Modify: `.gitignore`
- Delete: `.npmignore`

- [ ] **Step 1: Install new dependencies**

```bash
npm install --save-dev typescript @types/node @types/pg @types/pg-copy-streams tsx mocha@latest chai@latest
npm uninstall dotenv chai-as-promised
```

- [ ] **Step 2: Update package.json**

Replace the full contents of `package.json` with:

```json
{
  "name": "easy-postgres",
  "version": "3.0.0",
  "description": "Simple abstraction for working with PostgreSQL database",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "directories": {
    "test": "test"
  },
  "scripts": {
    "build": "tsc",
    "db:clean": "podman stop easy-postgres-test 2>/dev/null || true; podman rm easy-postgres-test 2>/dev/null || true",
    "db:start": "podman run -d --name easy-postgres-test -e POSTGRES_USER=tim -e POSTGRES_PASSWORD=testpassword -e POSTGRES_DB=playground -p 5432:5432 --health-cmd 'pg_isready -U tim' --health-interval 2s --health-start-period 10s docker.io/postgres:17",
    "db:stop": "podman stop easy-postgres-test && podman rm easy-postgres-test",
    "db:wait": "until podman healthcheck run easy-postgres-test; do sleep 1; done",
    "pretest": "npm run db:clean && npm run db:start && npm run db:wait",
    "test": "NODE_OPTIONS='--env-file=.env' mocha; EXIT=$?; npm run db:stop; exit $EXIT"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/theophilusx/easy-postgres.git"
  },
  "keywords": ["database", "Postgres", "PostgreSQL", "Promises", "Async/await"],
  "author": "Tim Cross",
  "license": "GPL-3.0-or-later",
  "bugs": {
    "url": "https://github.com/theophilusx/easy-postgres/issues"
  },
  "homepage": "https://github.com/theophilusx/easy-postgres#readme",
  "dependencies": {
    "pg": "^8.5.1",
    "pg-copy-streams": "^5.1.1"
  },
  "devDependencies": {
    "@types/node": "...",
    "@types/pg": "...",
    "@types/pg-copy-streams": "...",
    "chai": "...",
    "mocha": "...",
    "tsx": "...",
    "typescript": "..."
  }
}
```

> Note: `devDependencies` version strings will be filled in by npm after Step 1. Do not hardcode them — leave what npm wrote after install.

- [ ] **Step 3: Create `tsconfig.json`**

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

- [ ] **Step 4: Create `.mocharc.yml`**

```yaml
spec: test/**/*.ts
import: tsx/esm
timeout: 10000
```

- [ ] **Step 5: Create `.env.example`**

```
PGUSER=
PGPASSWORD=
PGHOST=localhost
PGDATABASE=playground
PGPORT=5432
PGAPPNAME=easy-postgres-test
```

- [ ] **Step 6: Update `.gitignore` — add `dist/`**

Append to the existing `.gitignore`:
```
dist/
```

- [ ] **Step 7: Delete `.npmignore`**

```bash
rm .npmignore
```

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .mocharc.yml .env.example .gitignore
git rm .npmignore
git commit -m "chore: scaffold v3 TypeScript + ESM project structure"
```

---

## Task 2: Error Classes (TDD — no DB required)

**Files:**
- Create: `src/errors.ts`
- Create: `test/04errors.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/04errors.ts`:

```typescript
import { expect } from 'chai';
import {
  EasyPostgresError,
  ConnectionError,
  QueryError,
  TransactionError,
  CopyError,
} from '../src/errors.js';

describe('Error class contracts', function () {
  it('EasyPostgresError sets name and message', function () {
    const err = new EasyPostgresError('base error');
    expect(err.name).to.equal('EasyPostgresError');
    expect(err.message).to.equal('base error');
    expect(err).to.be.instanceOf(Error);
  });

  it('EasyPostgresError preserves cause', function () {
    const cause = new Error('original');
    const err = new EasyPostgresError('wrapper', cause);
    expect(err.cause).to.equal(cause);
  });

  it('ConnectionError is instanceof EasyPostgresError', function () {
    const err = new ConnectionError('conn failed');
    expect(err).to.be.instanceOf(ConnectionError);
    expect(err).to.be.instanceOf(EasyPostgresError);
    expect(err.name).to.equal('ConnectionError');
  });

  it('QueryError carries .sql property', function () {
    const err = new QueryError('query failed', 'SELECT 1', new Error('cause'));
    expect(err).to.be.instanceOf(QueryError);
    expect(err.name).to.equal('QueryError');
    expect(err.sql).to.equal('SELECT 1');
    expect(err.cause).to.be.instanceOf(Error);
  });

  it('TransactionError carries .sql property', function () {
    const err = new TransactionError('tx failed', 'INSERT INTO t VALUES ($1)', new Error('c'));
    expect(err).to.be.instanceOf(TransactionError);
    expect(err.name).to.equal('TransactionError');
    expect(err.sql).to.equal('INSERT INTO t VALUES ($1)');
  });

  it('CopyError is instanceof EasyPostgresError', function () {
    const err = new CopyError('copy failed');
    expect(err).to.be.instanceOf(CopyError);
    expect(err).to.be.instanceOf(EasyPostgresError);
    expect(err.name).to.equal('CopyError');
  });

  it('each subclass is not instanceof the others', function () {
    const conn = new ConnectionError('x');
    const query = new QueryError('x', 'SELECT 1');
    expect(conn).to.not.be.instanceOf(QueryError);
    expect(query).to.not.be.instanceOf(ConnectionError);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
NODE_OPTIONS='--env-file=.env' npx mocha test/04errors.ts
```

Expected: Error — `Cannot find module '../src/errors.js'`

- [ ] **Step 3: Create `src/errors.ts`**

```typescript
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

- [ ] **Step 4: Run to confirm tests pass**

```bash
NODE_OPTIONS='--env-file=.env' npx mocha test/04errors.ts
```

Expected: 7 passing

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts test/04errors.ts
git commit -m "feat: add typed error class hierarchy"
```

---

## Task 3: Shared Types

**Files:**
- Create: `src/types.ts`

No tests needed — pure TypeScript interfaces are verified by the compiler when other modules use them.

- [ ] **Step 1: Create `src/types.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared TypeScript interfaces"
```

---

## Task 4: Pool Module + Connection Tests (TDD)

**Files:**
- Create: `src/pool.ts`
- Create: `test/00connect.ts`
- Delete: `test/00connect.js`

- [ ] **Step 1: Write the failing connection tests**

Create `test/00connect.ts`:

```typescript
import { expect } from 'chai';
import EasyPostgres from '../src/index.js';
import { ConnectionError } from '../src/errors.js';

describe('Connection tests', function () {
  it('creates pool with explicit config and executes query', async function () {
    const db = new EasyPostgres({
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      port: Number(process.env.PGPORT ?? '5432'),
      appname: process.env.PGAPPNAME,
    });
    const con = await db.getConnection();
    expect(con).to.be.an('object');
    const result = await con.query("SELECT 'hello' as val");
    await db.releaseConnection(con);
    await db.close();
    expect(result.rows[0].val).to.equal('hello');
  });

  it('creates pool using env vars (no config)', async function () {
    const db = new EasyPostgres();
    const result = await db.execSQL<{ val: number }>('SELECT 1 as val');
    await db.close();
    expect(result.rows[0].val).to.equal(1);
  });

  it('throws ConnectionError on invalid credentials', async function () {
    const db = new EasyPostgres({
      user: 'nonexistent_user_xyz',
      password: 'wrongpassword',
      host: process.env.PGHOST ?? 'localhost',
      database: process.env.PGDATABASE,
      port: Number(process.env.PGPORT ?? '5432'),
      connectionTimeoutMillis: 2000,
    });
    try {
      await db.getConnection();
      expect.fail('should have thrown ConnectionError');
    } catch (err) {
      expect(err).to.be.instanceOf(ConnectionError);
    } finally {
      await db.close();
    }
  });

  it('poolStatus() returns numeric fields', async function () {
    const db = new EasyPostgres();
    const status = db.poolStatus();
    expect(status.clientCount).to.be.a('number');
    expect(status.idleCount).to.be.a('number');
    expect(status.waitingCount).to.be.a('number');
    await db.close();
  });

  it('releaseConnection(null) is a no-op', async function () {
    const db = new EasyPostgres();
    await db.releaseConnection(null);   // must not throw
    await db.releaseConnection(undefined); // must not throw
    await db.close();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Start the DB container first if not running:
```bash
npm run db:clean && npm run db:start && npm run db:wait
```

Then:
```bash
NODE_OPTIONS='--env-file=.env' npx mocha test/00connect.ts
```

Expected: Error — `Cannot find module '../src/index.js'`

- [ ] **Step 3: Create `src/pool.ts`**

```typescript
import { Pool, PoolClient } from 'pg';
import { Config, PoolStatus } from './types.js';
import { ConnectionError } from './errors.js';

export class PoolManager {
  private pool: Pool;
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
        `getConnection failed: ${(err as Error).message}`,
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
        `releaseConnection failed: ${(err as Error).message}`,
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
        `close failed: ${(err as Error).message}`,
        err
      );
    } finally {
      this.poolError = null;
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
```

- [ ] **Step 4: Create minimal `src/index.ts` (pool methods only)**

This gives the connection tests something to import. It will grow in later tasks.

```typescript
import { Readable } from 'node:stream';
import type { PoolClient } from 'pg';
import { PoolManager } from './pool.js';
import type { Config, QueryResult, CopyResult, PoolStatus } from './types.js';

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

  // Stubs — filled in by later tasks
  execSQL<T>(_stmt: string, _params?: unknown[], _con?: PoolClient): Promise<QueryResult<T>> {
    throw new Error('not yet implemented');
  }

  execTransactionSQL<T>(_stmt: string, _params?: unknown[][], _con?: PoolClient): Promise<QueryResult<T>> {
    throw new Error('not yet implemented');
  }

  copyInsert<T>(_stmt: string, _fn: (r: T) => string, _data: T[], _con?: PoolClient): Promise<CopyResult> {
    throw new Error('not yet implemented');
  }

  copyFrom(_stmt: string, _con?: PoolClient): Promise<Readable> {
    throw new Error('not yet implemented');
  }
}

export default EasyPostgres;
```

- [ ] **Step 5: Run connection tests**

```bash
NODE_OPTIONS='--env-file=.env' npx mocha test/00connect.ts
```

Expected: 5 passing

- [ ] **Step 6: Remove old JS test file**

```bash
git rm test/00connect.js
```

- [ ] **Step 7: Commit**

```bash
git add src/pool.ts src/index.ts test/00connect.ts
git commit -m "feat: add PoolManager and connection tests (TypeScript)"
```

---

## Task 5: Query Module + execSQL/execTransactionSQL Tests (TDD)

**Files:**
- Create: `src/query.ts`
- Create: `test/01execSQL.ts`
- Modify: `src/index.ts`
- Delete: `test/01execSQL.js`

- [ ] **Step 1: Write the failing query tests**

Create `test/01execSQL.ts`:

```typescript
import { expect } from 'chai';
import EasyPostgres from '../src/index.js';
import { QueryError, TransactionError } from '../src/errors.js';

describe('Execute statement tests', function () {
  let db: EasyPostgres;

  before(async function () {
    db = new EasyPostgres();
    await db.execSQL('CREATE SCHEMA IF NOT EXISTS pghelper');
  });

  after(async function () {
    await db.execSQL('DROP TABLE IF EXISTS pghelper.test1');
    await db.execSQL('DROP TABLE IF EXISTS pghelper.test2');
    await db.close();
  });

  describe('execSQL', function () {
    it('returns a date', async function () {
      const rslt = await db.execSQL<{ now: Date }>('SELECT now() as now');
      expect(rslt.rows[0].now).to.be.a('date');
    });

    it('returns a number', async function () {
      const rslt = await db.execSQL<{ val: number }>('SELECT 1 as val');
      expect(rslt.rows[0].val).to.be.a('number');
    });

    it('returns a string', async function () {
      const rslt = await db.execSQL<{ val: string }>("SELECT 'Hello' as val");
      expect(rslt.rows[0].val).to.be.a('string');
    });

    it('accepts an explicit connection', async function () {
      const con = await db.getConnection();
      const rslt = await db.execSQL<{ now: Date }>('SELECT now() as now', [], con);
      await db.releaseConnection(con);
      expect(rslt.rows[0].now).to.be.a('date');
    });

    it('creates a table (command: CREATE)', async function () {
      const rslt = await db.execSQL(
        'CREATE TABLE pghelper.test1 (rec_id SERIAL PRIMARY KEY, name VARCHAR(10), val INTEGER)'
      );
      expect(rslt.command).to.equal('CREATE');
    });

    it('creates a table with explicit connection', async function () {
      const con = await db.getConnection();
      const rslt = await db.execSQL(
        'CREATE TABLE pghelper.test2 (rec_id SERIAL PRIMARY KEY, name VARCHAR(10), val INTEGER)',
        undefined,
        con
      );
      await db.releaseConnection(con);
      expect(rslt.command).to.equal('CREATE');
    });

    it('inserts a row', async function () {
      const rslt = await db.execSQL(
        'INSERT INTO pghelper.test1 (name, val) VALUES ($1, $2)',
        ['Some Name', 50]
      );
      expect(rslt.command).to.equal('INSERT');
      expect(rslt.rowCount).to.equal(1);
    });

    it('selects with a parameter', async function () {
      const rslt = await db.execSQL<{ name: string; val: number }>(
        'SELECT * FROM pghelper.test1 WHERE name = $1',
        ['Some Name']
      );
      expect(rslt.rowCount).to.equal(1);
      expect(rslt.rows[0].name).to.equal('Some Name');
      expect(rslt.rows[0].val).to.equal(50);
    });

    it('throws QueryError with .sql on invalid SQL', async function () {
      try {
        await db.execSQL('THIS IS NOT VALID SQL');
        expect.fail('should have thrown QueryError');
      } catch (err) {
        expect(err).to.be.instanceOf(QueryError);
        expect((err as QueryError).sql).to.equal('THIS IS NOT VALID SQL');
      }
    });
  });

  describe('execTransactionSQL', function () {
    it('inserts multiple rows and returns accumulated rowCount', async function () {
      const rslt = await db.execTransactionSQL(
        'INSERT INTO pghelper.test1 (name, val) VALUES ($1, $2)',
        [['val1', 10], ['val2', 20], ['val3', 30]]
      );
      expect(rslt.rowCount).to.equal(3);
    });

    it('selects multiple rows and accumulates rows array', async function () {
      const rslt = await db.execTransactionSQL<{ name: string }>(
        'SELECT * FROM pghelper.test1 WHERE name = $1',
        [['val1'], ['val2'], ['val3']]
      );
      expect(rslt.rowCount).to.equal(3);
      expect(rslt.rows.length).to.equal(3);
    });

    it('returns empty result for empty params', async function () {
      const rslt = await db.execTransactionSQL(
        'INSERT INTO pghelper.test1 (name, val) VALUES ($1, $2)',
        []
      );
      expect(rslt.rowCount).to.equal(0);
      expect(rslt.rows).to.deep.equal([]);
      expect(rslt.command).to.equal('');
    });

    it('rolls back and throws TransactionError on constraint violation', async function () {
      const before = await db.execSQL<{ c: string }>('SELECT COUNT(*) as c FROM pghelper.test1');
      try {
        // Inserting duplicate rec_id=999 twice violates PRIMARY KEY
        await db.execTransactionSQL(
          'INSERT INTO pghelper.test1 (rec_id, name, val) VALUES ($1, $2, $3)',
          [[999, 'first', 1], [999, 'duplicate', 2]]
        );
        expect.fail('should have thrown TransactionError');
      } catch (err) {
        expect(err).to.be.instanceOf(TransactionError);
        expect((err as TransactionError).sql).to.equal(
          'INSERT INTO pghelper.test1 (rec_id, name, val) VALUES ($1, $2, $3)'
        );
      }
      const after = await db.execSQL<{ c: string }>('SELECT COUNT(*) as c FROM pghelper.test1');
      // Row count unchanged — the transaction was rolled back
      expect(after.rows[0].c).to.equal(before.rows[0].c);
    });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
NODE_OPTIONS='--env-file=.env' npx mocha test/01execSQL.ts
```

Expected: All tests fail with `Error: not yet implemented`

- [ ] **Step 3: Create `src/query.ts`**

```typescript
import type { PoolClient } from 'pg';
import { PoolManager } from './pool.js';
import type { QueryResult } from './types.js';
import { QueryError, TransactionError } from './errors.js';

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
    return { rowCount: rslt.rowCount, rows: rslt.rows as T[], command: rslt.command };
  } catch (err) {
    throw new QueryError(`execSQL failed: ${(err as Error).message}`, stmt, err);
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
      // command: '' is a hardcoded sentinel for the zero-execution case
      return { rowCount: 0, rows: [], command: '' };
    }
    let result: QueryResult<T> | null = null;
    for (const p of params) {
      const rslt = await client.query(stmt, p);
      result = mkResult<T>(
        { rowCount: rslt.rowCount, rows: rslt.rows as T[], command: rslt.command },
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
      `execTransactionSQL failed: ${(err as Error).message}`,
      stmt,
      err
    );
  } finally {
    if (doRelease && client) {
      await pm.releaseConnection(client);
    }
  }
}
```

- [ ] **Step 4: Wire query methods into `src/index.ts`**

Replace the stub `execSQL` and `execTransactionSQL` methods. Add import at top:

```typescript
import { execSQL as _execSQL, execTransactionSQL as _execTransactionSQL } from './query.js';
```

Replace the two stub methods with:

```typescript
execSQL<T>(stmt: string, params?: unknown[], con?: PoolClient): Promise<QueryResult<T>> {
  return _execSQL<T>(this.pm, stmt, params, con);
}

execTransactionSQL<T>(stmt: string, params?: unknown[][], con?: PoolClient): Promise<QueryResult<T>> {
  return _execTransactionSQL<T>(this.pm, stmt, params, con);
}
```

- [ ] **Step 5: Run query tests**

```bash
NODE_OPTIONS='--env-file=.env' npx mocha test/01execSQL.ts
```

Expected: 13 passing

- [ ] **Step 6: Remove old JS test file**

```bash
git rm test/01execSQL.js
```

- [ ] **Step 7: Commit**

```bash
git add src/query.ts src/index.ts test/01execSQL.ts
git commit -m "feat: add query module with execSQL and execTransactionSQL"
```

---

## Task 6: copyInsert Module + Tests (TDD)

**Files:**
- Create: `src/copy.ts` (copyInsert only)
- Create: `test/02copyInsert.ts`
- Modify: `src/index.ts`
- Delete: `test/02copyInsert.js`

- [ ] **Step 1: Write the failing copyInsert tests**

Create `test/02copyInsert.ts`:

```typescript
import { expect } from 'chai';
import EasyPostgres from '../src/index.js';
import { CopyError } from '../src/errors.js';

const dateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`;
};

interface InsertRecord {
  recDate: Date;
  title: string;
  cost: number;
  order: number;
}

describe('copyInsert tests', function () {
  let db: EasyPostgres;

  before(async function () {
    db = new EasyPostgres();
    await db.execSQL('CREATE SCHEMA IF NOT EXISTS pghelper');
    await db.execSQL(
      'CREATE TABLE IF NOT EXISTS pghelper.insert_tst ' +
      '(rec_id SERIAL PRIMARY KEY, rec_date DATE, rec_title VARCHAR(20), ' +
      'rec_cost NUMERIC(10,2), rec_order INTEGER)'
    );
  });

  after(async function () {
    await db.execSQL('DROP TABLE IF EXISTS pghelper.insert_tst');
    await db.close();
  });

  it('inserts records and returns correct rowCount', async function () {
    const stmt =
      "COPY pghelper.insert_tst (rec_date, rec_title, rec_cost, rec_order) " +
      "FROM STDIN DELIMITER '\t' CSV QUOTE ''''";
    const data: InsertRecord[] = [
      { recDate: new Date(), title: 'First Record', cost: 2.5, order: 1 },
      { recDate: new Date('2021-01-01'), title: 'Second Record', cost: 4.5, order: 2 },
      { recDate: new Date('2021-01-15'), title: 'Third Record', cost: 6.75, order: 3 },
      { recDate: new Date('2021-02-10'), title: 'Forth Record', cost: 10.5, order: 4 },
    ];
    const toString = (r: InsertRecord) =>
      `'${dateStr(r.recDate)}'\t'${r.title}'\t${r.cost}\t${r.order}\n`;

    const rslt = await db.copyInsert(stmt, toString, data);
    expect(rslt.rowCount).to.equal(4);

    const verify = await db.execSQL('SELECT * FROM pghelper.insert_tst');
    expect(verify.rowCount).to.equal(4);
  });

  it('returns rowCount 0 for empty data array', async function () {
    const stmt =
      "COPY pghelper.insert_tst (rec_date, rec_title, rec_cost, rec_order) " +
      "FROM STDIN DELIMITER '\t' CSV QUOTE ''''";
    const rslt = await db.copyInsert(stmt, () => '', []);
    expect(rslt.rowCount).to.equal(0);
  });

  it('throws CopyError on invalid COPY statement', async function () {
    try {
      await db.copyInsert('THIS IS NOT A COPY STATEMENT', (r) => String(r), ['x']);
      expect.fail('should have thrown CopyError');
    } catch (err) {
      expect(err).to.be.instanceOf(CopyError);
    }
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
NODE_OPTIONS='--env-file=.env' npx mocha test/02copyInsert.ts
```

Expected: All fail with `Error: not yet implemented`

- [ ] **Step 3: Create `src/copy.ts` with `copyInsert`**

```typescript
import { Readable } from 'node:stream';
import type { PoolClient } from 'pg';
import * as pgCopyStreams from 'pg-copy-streams';
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
```

> **Note on imports:** If `import * as pgCopyStreams from 'pg-copy-streams'` causes TypeScript errors due to the CJS module format, try `import pgCopyStreams from 'pg-copy-streams'` instead. The `from` and `to` properties should be accessible either way.

- [ ] **Step 4: Wire copyInsert into `src/index.ts`**

Add import at top of `src/index.ts`:

```typescript
import { copyInsert as _copyInsert, copyFrom as _copyFrom } from './copy.js';
```

Replace the stub `copyInsert` method:

```typescript
copyInsert<T>(
  stmt: string,
  stringifyFn: (record: T) => string,
  data: T[],
  con?: PoolClient
): Promise<CopyResult> {
  return _copyInsert<T>(this.pm, stmt, stringifyFn, data, con);
}
```

Also wire the `copyFrom` stub (still throws, but wired):

```typescript
copyFrom(stmt: string, con?: PoolClient): Promise<Readable> {
  return _copyFrom(this.pm, stmt, con);
}
```

- [ ] **Step 5: Run copyInsert tests**

```bash
NODE_OPTIONS='--env-file=.env' npx mocha test/02copyInsert.ts
```

Expected: 3 passing

- [ ] **Step 6: Remove old JS test file**

```bash
git rm test/02copyInsert.js
```

- [ ] **Step 7: Commit**

```bash
git add src/copy.ts src/index.ts test/02copyInsert.ts
git commit -m "feat: add copyInsert bulk insert via COPY FROM STDIN"
```

---

## Task 7: copyFrom Module + Stream Tests (TDD)

**Files:**
- Modify: `src/copy.ts` (add copyFrom implementation)
- Create: `test/03copyFrom.ts`

- [ ] **Step 1: Write the failing copyFrom tests**

Create `test/03copyFrom.ts`:

```typescript
import { expect } from 'chai';
import EasyPostgres from '../src/index.js';
import { CopyError } from '../src/errors.js';

describe('copyFrom tests', function () {
  let db: EasyPostgres;

  before(async function () {
    db = new EasyPostgres();
    await db.execSQL('CREATE SCHEMA IF NOT EXISTS pghelper');
    await db.execSQL(
      'CREATE TABLE IF NOT EXISTS pghelper.copy_from_tst ' +
      '(id SERIAL PRIMARY KEY, label TEXT)'
    );
    await db.execSQL(
      'INSERT INTO pghelper.copy_from_tst (label) VALUES ($1), ($2), ($3)',
      ['alpha', 'beta', 'gamma']
    );
  });

  after(async function () {
    await db.execSQL('DROP TABLE IF EXISTS pghelper.copy_from_tst');
    await db.close();
  });

  it('returns a Readable and yields data chunks via async iteration', async function () {
    const stream = await db.copyFrom('COPY pghelper.copy_from_tst TO STDOUT');
    let totalBytes = 0;
    for await (const chunk of stream) {
      expect(Buffer.isBuffer(chunk)).to.be.true;
      totalBytes += (chunk as Buffer).length;
    }
    expect(totalBytes).to.be.greaterThan(0);
  });

  it('stream closes cleanly (close event fires)', async function () {
    const stream = await db.copyFrom('COPY pghelper.copy_from_tst TO STDOUT');
    const closed = await new Promise<boolean>((resolve) => {
      stream.on('close', () => resolve(true));
      stream.resume(); // consume to trigger end → close
    });
    expect(closed).to.be.true;
  });

  it('rejects with CopyError for invalid table in COPY statement', async function () {
    // The error surfaces as an 'error' event on the stream, not a rejected Promise,
    // because pg-copy-streams sends the query asynchronously.
    const stream = await db.copyFrom('COPY nonexistent_table_xyz TO STDOUT');
    const err = await new Promise<unknown>((resolve) => {
      stream.on('error', resolve);
      stream.resume();
    });
    expect(err).to.be.instanceOf(CopyError);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
NODE_OPTIONS='--env-file=.env' npx mocha test/03copyFrom.ts
```

Expected: All fail with `Error: copyFrom not yet implemented`

- [ ] **Step 3: Implement `copyFrom` in `src/copy.ts`**

Replace the `copyFrom` stub with the full implementation:

```typescript
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
```

- [ ] **Step 4: Run copyFrom tests**

```bash
NODE_OPTIONS='--env-file=.env' npx mocha test/03copyFrom.ts
```

Expected: 3 passing

- [ ] **Step 5: Commit**

```bash
git add src/copy.ts test/03copyFrom.ts
git commit -m "feat: add copyFrom streaming bulk export via COPY TO STDOUT"
```

---

## Task 8: Full Test Suite Pass

Run all tests together to catch any cross-module issues before the build step.

- [ ] **Step 1: Run all tests**

```bash
NODE_OPTIONS='--env-file=.env' npx mocha 'test/**/*.ts'
```

Expected: All tests across all 5 files passing (approximately 28+ tests)

- [ ] **Step 2: Fix any failures before continuing**

If any test fails, debug and fix before proceeding to Task 9.

---

## Task 9: Build and Cleanup

**Files:**
- Delete: `src/index.js`
- Delete: `test/00connect.js`, `test/01execSQL.js`, `test/02copyInsert.js` (already deleted in earlier tasks)
- Add: `dist/` to `.gitignore` (already done in Task 1)

- [ ] **Step 1: Build TypeScript**

```bash
npm run build
```

Expected: No errors. `dist/` directory created containing:
- `dist/index.js`
- `dist/index.d.ts`
- `dist/index.d.ts.map`
- `dist/errors.js`, `dist/errors.d.ts`
- `dist/types.js`, `dist/types.d.ts`
- `dist/pool.js`, `dist/pool.d.ts`
- `dist/query.js`, `dist/query.d.ts`
- `dist/copy.js`, `dist/copy.d.ts`

- [ ] **Step 2: Verify dist/ exports**

```bash
node -e "import('./dist/index.js').then(m => console.log(Object.keys(m)))"
```

Expected: Output includes `EasyPostgres`, `ConnectionError`, `QueryError`, `TransactionError`, `CopyError`, `EasyPostgresError`

- [ ] **Step 3: Delete old JavaScript source**

```bash
git rm src/index.js
```

- [ ] **Step 4: Run the full npm test pipeline**

This starts the Podman container, runs all tests, then tears down the container.

```bash
npm test
```

Expected: All tests pass; container cleaned up afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/ test/
git commit -m "feat: complete v3 TypeScript rewrite — ESM, error classes, copyFrom, Podman tests"
```

> Note: `dist/` is gitignored and must not be committed — npm uses the `"files"` field in `package.json` to include it in published packages without tracking it in git.

- [ ] **Step 6: Verify npm publish contents (dry run)**

```bash
npm pack --dry-run
```

Expected output includes:
- `dist/index.js`
- `dist/index.d.ts`
- `dist/errors.js`, `dist/errors.d.ts`
- `dist/types.js`, `dist/types.d.ts`
- `dist/pool.js`, `dist/pool.d.ts`
- `dist/query.js`, `dist/query.d.ts`
- `dist/copy.js`, `dist/copy.d.ts`
- `README.md`
- `LICENSE`
- `package.json`

Must NOT include: `src/`, `test/`, `.env`, `.env.example`, `tsconfig.json`

- [ ] **Step 7: Final commit**

If Step 6 shows anything unexpected in the package contents, fix `.gitignore`/`package.json` and re-commit. Otherwise:

```bash
git tag v3.0.0
```

---

## Prerequisites

Before running any test commands, create your local `.env` from the template:

```bash
cp .env.example .env
# then edit .env and fill in PGUSER, PGPASSWORD, etc.
```

Node 22 will fail with "file not found" if `.env` is absent when `NODE_OPTIONS='--env-file=.env'` is set.

---

## Quick Reference

**Start DB manually (for development):**
```bash
npm run db:clean && npm run db:start && npm run db:wait
```

**Run a single test file:**
```bash
NODE_OPTIONS='--env-file=.env' npx mocha test/04errors.ts
```

**Run all tests without container lifecycle:**
```bash
NODE_OPTIONS='--env-file=.env' npx mocha 'test/**/*.ts'
```

**Full test run (with container):**
```bash
npm test
```

**Build:**
```bash
npm run build
```
