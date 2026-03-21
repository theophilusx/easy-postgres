import { expect } from 'chai';
import EasyPostgres from '../src/index.js';
import { ConnectionError, EasyPostgresError } from '../src/errors.js';

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

  it('close() makes the instance unusable', async function () {
    const db = new EasyPostgres();
    await db.close();
    try {
      await db.execSQL('SELECT 1');
      expect.fail('should have thrown after close');
    } catch (err) {
      // execSQL wraps the pool-closed error in QueryError (which extends EasyPostgresError)
      expect(err).to.be.instanceOf(EasyPostgresError);
    }
  });

  it('appname config is forwarded as application_name to PostgreSQL', async function () {
    const appname = 'easy-postgres-test-app';
    const db = new EasyPostgres({
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      port: Number(process.env.PGPORT ?? '5432'),
      appname,
    });
    try {
      // pg_stat_activity.application_name reflects the connection's application_name
      const result = await db.execSQL<{ appname: string }>(
        "SELECT application_name AS appname FROM pg_stat_activity WHERE pid = pg_backend_pid()"
      );
      expect(result.rows[0].appname).to.equal(appname);
    } finally {
      await db.close();
    }
  });
});
