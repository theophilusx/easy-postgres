- [PgHelper](#sec-1)
  - [Installation](#sec-1-1)
  - [Basic Examples](#sec-1-2)
  - [Class Methods](#sec-1-3)
  - [Bug Reports & Issues](#sec-1-4)
  - [Version History](#sec-1-5)


# PgHelper<a id="sec-1"></a>

A very simple abstraction over the `pg` and `pg-copy-streams` libraries to simplify working with a PostgreSQL database. Features include

-   Uses the `pg` connection pool for connections
-   Supports automatic or manual management of connections
-   Supports performing commands as part of the same session (connection). Useful for working with temporary tables
-   Support for transactions and commit/rollback
-   Support for bulk data insert using the `\copy` command
-   Promise/async based interface

The library is by no means complete. It currently meets all my own use cases, but there is room for adding more functionality as required. Pull requests are welcome, but please ensure they include `Mocha` based tests.

This module is really just a wrapper around the `pg` and `pg-copy-streams` modules from NPM. Therefore, refer to the documentation for these modules for additional information on things like the structure of result sets returned from queries etc.

## Installation<a id="sec-1-1"></a>

## Basic Examples<a id="sec-1-2"></a>

## Class Methods<a id="sec-1-3"></a>

### Constructor<a id="sec-1-3-1"></a>

The class constructor can be called with or without a `config` object containing properties representing the connection parameters for the database. The properties have the same names as the environment variables used by `libpq`. If no config object is passed in, the `pg` library will look for the necessary environment variables in the process execution environment. If you use the `dotenv` NPM module, you can create a .env file containing the necessary parameters and avoid the need to pass in a config object or you can just set the variables manually. For example, you could have a `.env` file with the following entries;

```conf
PGUSER=tim
PGPASSWORD='secret'
PGHOST=db.example.com
PGDATABASE=appdb
PGPORT=5432
PGAPPNAME='cool-app'
```

Then in your code you could have something like;

```js2
"use strict";

const dotenvPath = __dirname + "/../.env";
require("dotenv").config({ path: dotenvPath });

const PgHelper = require("pg-helper");

const db = new PgHelper();

let rslt = db.execSQL("SELECT * FROM my_table");
```

However, if you prefer to not use `dotenv` or environment variables, you can just pass in the `config` object e.g.

```js2
"use strict";

const PgHelper = require("pg-helper");

const config = {
  user: "tim",
  password: "secret",
  host: "db.example.com",
  database: "appdb",
  port: 5432
};

const db = new PgHelper(config);

let rslt = db.execSQL("SELECT * FROM my_table");
```

### getConnection()<a id="sec-1-3-2"></a>

The `getconnection()` method returns a database connection from the connection pool. This can be useful if you want to manage the connection manually, which is sometimes necessary if you want to ensure all SQL runs within the same connection session (for example, when working with temporary tables). The other methods which execute SQL statements take an optional connection as the last argument. When no conneciton is passed in for these methods, the method will request one from the conneciton pool and release it after executing the SQL statement. When you pass in a connection, you are responsible for releasing that connection when you are finished with it.

### releaseConnection(con)<a id="sec-1-3-3"></a>

The `releaseConnection(con)` method is used to release the conneciton `con` back to the connection pool. After obtaining a connection with a call to `getConnection()`, you need to release it back to the pool once your finished using it.

con :: a conneciton object obtained from a call to getConnection().

### close()<a id="sec-1-3-4"></a>

The `close()` method signals that your finished interacting with the database and want to release the connection pool. You should call this method before existing your script. Once you have called `close()` you cannot use the PgHelper object and should destroy it. If you need to re-connect, you will need to call `new PgHelper()`.

### execSQL(stmt, params, con)<a id="sec-1-3-5"></a>

The `execSQL(stmt, params, con)` method executes the statement defined in the `stmt` argument. The argument is a string. Statements can contain parameter placeholders using `$1, $2, ... $n`. When placeholder arguments are used, the optional `params` argument contains the values for the placeholders as an array of values. The optional `con` argument is a connection object returned from a call to `getConnection()`. If no `con` argument is supplied, the method will request a connection from the connection pool.

Examples

```js2
"use strict";

const dotenvPath = __dirname + "/../.env";
require("dotenv").config({ path: dotenvPath });

const PgHelper = require("pg-helper");

const db = new PgHelper();

const createStmt = "CREATE TABLE my_table ("
      + "rec_id SERIAL PRIMARY KEY, name VARCHAR(20), val INTEGER";
const insertStmt = "INSERT INTO my_table (name, val) VALUES ($1, $2)";
const insertParams = ["Some Name", 50];
const selectStmt = "SELECT * FROM my_table WHERE name = $1";
const selectpParams = ["Some Name"];

async function run() {
  await db.execSQL(createStmt);
  let rs1 = await db.execSQL(insertStmt, insertParams);
  console.log(`Inserted ${rs1.rowCount} rows`);
  let rs2 = await db.execSQL(selectStmt, selectParams);
  console.log(`Name: ${rs2.rows[0].name} Value: ${rs2.rows[0].val}`);
}

run();
```

## Bug Reports & Issues<a id="sec-1-4"></a>

Please report bugs via the issues page on github at <https://github.com/theophilusx/pg-helper> . Please make sure to include the following information in all reports

-   pg-helper version
-   Node version
-   PostgreSQL version
-   Client platform (Linux, Mac, Windows)
-   Database platform

If possible, include a small reproducible example e.g. simple script which exhibits the issue you are encountering. There is a much higher chance of a quick fix if I am able to reproduce the problem.

Please note that I am not a windows user and have not used that platform in any meaningful way since around 1997. While I am happy to try and run up a Windows virtual for testing purposes, I have little experience on that platform. However, I am happy to work with anyone experiencing issues on Windows to try and resolve any issues.

## Version History<a id="sec-1-5"></a>
