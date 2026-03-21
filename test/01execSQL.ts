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
      expect(rslt.command).to.be.null;
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

    it('uses an explicit connection when provided', async function () {
      const con = await db.getConnection();
      try {
        const rslt = await db.execTransactionSQL(
          'INSERT INTO pghelper.test1 (name, val) VALUES ($1, $2)',
          [['expl_con', 77]],
          con
        );
        expect(rslt.rowCount).to.equal(1);
      } finally {
        await db.releaseConnection(con);
      }
    });
  });

  describe('execTransaction', function () {
    it('commits a multi-statement callback transaction and returns callback result', async function () {
      const result = await db.execTransaction<{ name: string; val: number }>(async (con) => {
        await db.execSQL(
          'INSERT INTO pghelper.test1 (name, val) VALUES ($1, $2)',
          ['tx_multi', 42],
          con
        );
        const r = await db.execSQL<{ name: string; val: number }>(
          'SELECT name, val FROM pghelper.test1 WHERE name = $1',
          ['tx_multi'],
          con
        );
        return r.rows[0];
      });
      expect(result.name).to.equal('tx_multi');
      expect(result.val).to.equal(42);
    });

    it('rolls back and rethrows when the callback throws', async function () {
      try {
        await db.execTransaction(async (con) => {
          await db.execSQL(
            'INSERT INTO pghelper.test1 (name, val) VALUES ($1, $2)',
            ['rollback', 999],
            con
          );
          throw new Error('intentional rollback');
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).to.equal('intentional rollback');
      }
      const after = await db.execSQL<{ c: string }>('SELECT COUNT(*) as c FROM pghelper.test1 WHERE name = $1', ['rollback']);
      expect(after.rows[0].c).to.equal('0');
    });

    it('uses an explicit connection when provided', async function () {
      const con = await db.getConnection();
      try {
        const result = await db.execTransaction<number>(async (txCon) => {
          const r = await db.execSQL<{ val: number }>('SELECT 99 AS val', [], txCon);
          return r.rows[0].val;
        }, con);
        expect(result).to.equal(99);
      } finally {
        await db.releaseConnection(con);
      }
    });
  });
});
