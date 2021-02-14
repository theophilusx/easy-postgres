"use strict";

const dotenvPath = __dirname + "/../.env";
require("dotenv").config({ path: dotenvPath });

const chai = require("chai");
const expect = chai.expect;
const chaiAsPromised = require("chai-as-promised");
const EasyPostgres = require("../src/index");

chai.use(chaiAsPromised);

describe("Connection tests", function () {
  let config = {};
  let db = undefined;

  before("Setup hook", function () {
    config = {
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      port: process.env.PGPORT,
      appname: process.env.PGAPPNAME,
    };
  });

  it("Create pool with credentials", async function () {
    db = new EasyPostgres(config);
    expect(db).to.be.an("object");
    let con = await db.getConnection();
    expect(con).to.be.an("object");
    let result = await con.query("SELECT 'The time is ' || now() as result");
    await db.releaseConnection(con);
    await db.close();
    return expect(result.rows[0].result).to.be.a("string");
  });

  it("Create pool with env vars", async function () {
    db = new EasyPostgres(config);
    expect(db).to.be.an("object");
    let con = await db.getConnection();
    expect(con).to.be.an("object");
    let result = await con.query("SELECT 'The time is ' || now() as result");
    await db.releaseConnection(con);
    await db.close();
    return expect(result.rows[0].result).to.be.a("string");
  });
});
