"use strict";

const { Client, Pool } = require("pg");
const copyFrom = require("pg-copy-streams").from;

const mkResult = (rslt, accRslt) => {
  if (!accRslt) {
    return rslt;
  }
  accRslt.rowCount += rslt.rowCount;
  accRslt.rows = [...accRslt.rows, ...rslt.rows];
  return accRslt;
};

class PgHelper {
  constructor(config) {
    this.poolError = null;
    if (config) {
      this.pool = new Pool(config);
    } else {
      this.pool = new Pool();
    }
    this.doRelease = false;
    this.pool.on("error", (err) => {
      this.poolError = err;
    });
  }

  /**
   * @async
   *
   * Returns a DB connection from the connection pool
   *
   * @throws Error object if an error occurs
   */
  async getConnection() {
    try {
      const client = await this.pool.connect();
      if (this.poolError) {
        throw new Error(this.poolError.message);
      }
      return client;
    } catch (err) {
      throw new Error(`Connect: ${err.message}`);
    }
  }

  /**
   * @async
   *
   * Releases a pool connection and returns it to the connection pool
   *
   * @throws Error object when an error occurs
   */
  async releaseConnection(c) {
    try {
      if (c) {
        await c.release();
      }
      if (this.poolError) {
        throw new Error(this.poolError.message);
      }
    } catch (err) {
      throw new Error(`Disconnect: ${err.message}`);
    }
  }

  /**
   * @async
   *
   * Close down the connection pool. After calling this method, the object can no longer be used
   * and should be disposed. A new object will need to be created for further database operations.
   *
   * @throws Error if there is an error when freeing up the pool
   */
  async close() {
    try {
      if (this.pool) {
        await this.pool.end;
      }
      if (this.poolError) {
        throw new Error(this.poolError.message);
      }
    } catch (err) {
      throw new Error(`Close: ${err.message}`);
    } finally {
      this.pool = undefined;
      this.poolError = null;
    }
  }

  /**
   * @async
   *
   * Execute an SQL statement, possibly using optional parameters and return the
   * result object. An optional connection object can be passed in, which will be used
   * instead of getting a fresh connection from the pool.
   *
   * @param {String} stmt - an SQL statement to execute
   * @param {Array} params - (Optional) An array of parameters to be used
   * @param {Object} con - (Optional) A connection object to use
   *
   * @throws {Error} if an error occurs.
   */
  async execSQL(stmt, params = [], con) {
    let rslt;

    try {
      if (!con) {
        con = await this.getConnection();
        this.doRelease = true;
      }
      if (params.length) {
        rslt = await con.query(stmt, params);
      } else {
        rslt = await con.query(stmt, params);
      }
      if (this.poolError) {
        let e = new Error(this.poolError.message);
        this.poolError = null;
        throw e;
      }
      return rslt;
    } catch (err) {
      throw new Error(`execSQL: ${err.message} Statement: ${stmt}`);
    } finally {
      if (this.doRelease) {
        await this.releaseConnection(con);
        this.doRelease = false;
      }
    }
  }

  /**
   * @async
   *
   * Execute statement within a transaction block. If all statement executions succeed without
   * failure, the transaction is committed. If an error occurs, the transaction is rolled back.
   * The stmt argument is a string SQL statement, usually with placeholder parameters. The
   * params argument is an array of arrays. Each sub-array contains the values to be applied
   * to the placeholder arguments in the statement.
   *
   * The return value is an accumulated result set object. The rowcCount property is an accumulation
   * of the rowCount property for each result set returned from each execution of the statement. The
   * rows property is an accumulation of all the rows values from each result set returned from all
   * statement executions.
   *
   * The con parameter is an optional connection object. If provided, it will be used for the execution
   * of statements. If not supplied, the method will retrieve a new connection from the pool and return
   * it on completion.
   *
   * @param {String} stmt - an SQL statement to execute. Placeholder arguments supported
   * @param {Array} params - (Optional) an array of arrays where each sub-array are the values to use for
   *                         placeholder arguments. One sub-array used for each statement execution.
   * @param {Object} con - (Optionsl) a connection object to use for execution of statements.
   *
   * @throws {Error} if an error is raised
   */
  async execTransactionSQL(stmt, params = [], con) {
    let result;

    try {
      if (!con) {
        con = await this.getConnection();
        this.doRelease = true;
      }
      await con.query("BEGIN");
      if (params.length) {
        for (let p of params) {
          let rslt = await con.query(stmt, p);
          result = mkResult(rslt, result);
        }
      } else {
        result = await con.query(stmt);
      }
      await con.query("COMMIT");
      if (this.poolError) {
        let e = new Error(this.poolError.message);
        this.poolError = null;
        throw e;
      }
      return result;
    } catch (err) {
      try {
        await con.query("ROLLBACK");
        throw err;
      } catch (err2) {
        throw new Error(
          `execTransactionSQL: ${err2.message} Statement: ${stmt}`
        );
      }
    } finally {
      try {
        if (this.doRelease) {
          await this.releaseConnection(con);
          this.doRelease = false;
        }
      } catch (err) {
        throw new Error(
          `execTransactionSQL: Error releasing connection: ${err.message}`
        );
      }
    }
  }
}

module.exports = PgHelper;
