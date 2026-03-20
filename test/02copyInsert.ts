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
