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

  it('uses an explicit connection (caller releases it)', async function () {
    const con = await db.getConnection();
    try {
      const stream = await db.copyFrom('COPY pghelper.copy_from_tst TO STDOUT', con);
      let bytes = 0;
      for await (const chunk of stream) {
        bytes += (chunk as Buffer).length;
      }
      expect(bytes).to.be.greaterThan(0);
    } finally {
      await db.releaseConnection(con);
    }
  });

  it('auto-releases connection when stream is destroyed before end', async function () {
    const statusBefore = db.poolStatus();
    const stream = await db.copyFrom('COPY pghelper.copy_from_tst TO STDOUT');
    // Destroy the stream without consuming it — connection should still be released.
    await new Promise<void>((resolve) => {
      stream.on('close', resolve);
      stream.destroy();
    });
    const statusAfter = db.poolStatus();
    expect(statusAfter.idleCount).to.be.gte(statusBefore.idleCount);
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
