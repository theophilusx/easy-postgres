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
  async getClient() {
    try {
      const client = await this.pool.connect();
      if (this.poolError) {
        throw new Error(this.poolError.message);
      }
      return client;
    } catch (err) {
      throw new Error(`DB Connect Error: ${err.message}`);
    }
  }

  /**
   * @async
   *
   * Releases a pool connection and returns it to the connection pool
   *
   * @throws Error object when an error occurs
   */
  async releaseClient(c) {
    try {
      if (c) {
        await c.release();
      }
      if (this.poolError) {
        throw new Error(this.poolError.message);
      }
    } catch (err) {
      throw new Error(`DB Disconnect Error: ${err.message}`);
    }
  }
}

module.exports = PgHelper;
