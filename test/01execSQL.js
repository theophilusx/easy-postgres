"use strict";

const dotenvPath = __dirname + "/../.env";
require("dotenv").config({ path: dotenvPath });

const chai = require("chai");
const expect = chai.expect;
const chaiAsPromised = require("chai-as-promised");
const PgHelper = require("../src/index");

chai.use(chaiAsPromised);

describe("Execute statement tests", function () {
  let db;

  before("Setup hook", async function () {
    db = new PgHelper();
  });

  after("Cleanup hook", async function () {
    await db.execSQL("DROP TABLE IF EXISTS pghelper.test1");
    await db.execSQL("DROP TABLE IF EXISTS pghelper.test2");
    await db.close();
  });

  describe("execSQL tests", function () {
    it("Simple select of date", async function () {
      let rslt = await db.execSQL("SELECT now() as now");
      return expect(rslt.rows[0].now).to.be.a("date");
    });

    it("Simple select of number", async function () {
      let rslt = await db.execSQL("SELECT 1 as val");
      return expect(rslt.rows[0].val).to.be.a("number");
    });

    it("Simple select of string", async function () {
      let rslt = await db.execSQL("Select 'Hello' as val");
      return expect(rslt.rows[0].val).to.be.a("string");
    });

    it("Simple select with connection of date", async function () {
      let con = await db.getConnection();
      let rslt = await db.execSQL("SELECT now() as now", [], con);
      await db.releaseConnection(con);
      return expect(rslt.rows[0].now).to.be.a("date");
    });

    it("Simple select with connection of number", async function () {
      let con = await db.getConnection();
      let rslt = await db.execSQL("SELECT 1 as val", [], con);
      await db.releaseConnection(con);
      return expect(rslt.rows[0].val).to.be.a("number");
    });

    it("Simple select with connection of string", async function () {
      let con = await db.getConnection();
      let rslt = await db.execSQL("SELECT 'Hello' as val", [], con);
      await db.releaseConnection(con);
      return expect(rslt.rows[0].val).to.be.a("string");
    });

    it("Simple create table", async function () {
      let stmt =
        "CREATE TABLE pghelper.test1 (" +
        "rec_id SERIAL PRIMARY KEY, name VARCHAR(10), val INTEGER)";
      let rslt = await db.execSQL(stmt);
      return expect(rslt.command).to.equal("CREATE");
    });

    it("Simple create table with connection", async function () {
      let stmt =
        "CREATE TABLE pghelper.test2 (" +
        "rec_id SERIAL PRIMARY KEY, name VARCHAR(10), val INTEGER)";
      let con = await db.getConnection();
      let rslt = await db.execSQL(stmt, undefined, con);
      await db.releaseConnection(con);
      return expect(rslt.command).to.equal("CREATE");
    });

    it("Simple insert test", async function () {
      let stmt = "INSERT INTO pghelper.test1 (name, val) VALUES ($1, $2)";
      let values = ["Some Name", 50];
      let rslt = await db.execSQL(stmt, values);
      expect(rslt.command).to.equal("INSERT");
      return expect(rslt.rowCount).to.equal(1);
    });

    it("Simple insert testi with connection", async function () {
      let stmt = "INSERT INTO pghelper.test2 (name, val) VALUES ($1, $2)";
      let values = ["Other Name", 100];
      let con = await db.getConnection();
      let rslt = await db.execSQL(stmt, values, con);
      await db.releaseConnection(con);
      expect(rslt.command).to.equal("INSERT");
      return expect(rslt.rowCount).to.equal(1);
    });

    it("Simple select with parameters", async function () {
      let stmt = "SELECT * FROM pghelper.test1 WHERE name = $1";
      let params = ["Some Name"];
      let rslt = await db.execSQL(stmt, params);
      expect(rslt.rowCount).to.equal(1);
      expect(rslt.rows[0].name).to.equal("Some Name");
      return expect(rslt.rows[0].val).to.equal(50);
    });

    it("Simple select with parameters and connection", async function () {
      let stmt = "SELECT * FROM pghelper.test2 WHERE name = $1";
      let params = ["Other Name"];
      let rslt = await db.execSQL(stmt, params);
      expect(rslt.rowCount).to.equal(1);
      expect(rslt.rows[0].name).to.equal("Other Name");
      return expect(rslt.rows[0].val).to.equal(100);
    });
  });

  describe("execTransactionSQL tests", function () {
    it("Insert multiple rows", async function () {
      let stmt = "INSERT INTO pghelper.test1 (name, val) VALUES ($1, $2)";
      let params = [
        ["val1", 10],
        ["val2", 20],
        ["val3", 30],
      ];
      let rslt = await db.execTransactionSQL(stmt, params);
      return expect(rslt.rowCount).to.equal(3);
    });

    it("Select multiple rows", async function () {
      let stmt = "SELECT * FROM pghelper.test1 WHERE name = $1";
      let params = [["val1"], ["val2"], ["val3"]];
      let rslt = await db.execTransactionSQL(stmt, params);
      expect(rslt.rowCount).to.equal(3);
      return expect(rslt.rows.length).to.equal(3);
    });

    it("Update multiple rows", async function () {
      let stmt =
        "UPDATE pghelper.test1 SET name = $2 WHERE name = $1 RETURNING *";
      let params = [
        ["val1", "value1"],
        ["val2", "value2"],
        ["val3", "value3"],
      ];
      let rslt = await db.execTransactionSQL(stmt, params);
      expect(rslt.rowCount).to.equal(3);
      return expect(rslt.rows.length).to.equal(3);
    });
  });
});
