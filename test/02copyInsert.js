"use strict";

const dotenvPath = __dirname + "/../.env";
require("dotenv").config({ path: dotenvPath });

const chai = require("chai");
const expect = chai.expect;
const chaiAsPromised = require("chai-as-promised");
const PgHelper = require("../src/index");

chai.use(chaiAsPromised);

const dateStr = (d) => {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  return `${year}-${month < 10 ? `0${month}` : month}-${
    day < 10 ? `0${day}` : day
  }`;
};

describe("copyInsert tests", function () {
  let db;

  before("setup hook", async function () {
    let create =
      "CREATE TABLE IF NOT EXISTS pghelper.insert_tst " +
      "(rec_id SERIAL PRIMARY KEY, rec_date DATE, rec_title VARCHAR(20)," +
      "rec_cost NUMERIC(10,2), rec_order INTEGER)";

    db = new PgHelper();
    await db.execSQL(create);
  });

  after("cleanup hook", async function () {
    await db.execSQL("DROP TABLE IF EXISTS pghelper.insert_tst");
    await db.close();
  });

  it("Insert records", async function () {
    let stmt =
      "COPY pghelper.insert_tst " +
      "(rec_date, rec_title, rec_cost, rec_order) " +
      "FROM STDIN DELIMITER '\t' CSV QUOTE ''''";
    let data = [
      {
        recDate: new Date(),
        title: "First Record",
        cost: 2.5,
        order: 1,
      },
      {
        recDate: new Date("2021-01-01"),
        title: "Second Record",
        cost: 4.5,
        order: 2,
      },
      {
        recDate: new Date("2021-01-15"),
        title: "Third Record",
        cost: 6.75,
        order: 3,
      },
      {
        recDate: new Date("2021-02-10"),
        title: "Forth Record",
        cost: 10.5,
        order: 4,
      },
    ];

    const toString = (r) => {
      return `'${dateStr(r.recDate)}'\t'${r.title}'\t${r.cost}\t${r.order}\n`;
    };
    let rslt = await db.copyInsert(stmt, toString, data);
    expect(rslt.rowCount).to.equal(4);
    rslt = await db.execSQL("SELECT * FROM pghelper.insert_tst");
    return expect(rslt.rowCount).to.equal(4);
  });
});
