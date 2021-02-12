"use strict";

const { Client, Pool } = require("pg");
const copyFrom = require("pg-copy-streams").from;

class PgHelper {
  constructor(config) {
    this.poolError = null;
    if (config) {
      this.pool = new Pool(config);
    } else {
      this.pool = new Pool();
    }
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
}

module.exports = PgHelper;
