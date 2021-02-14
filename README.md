- [PgHelper](#sec-1)
  - [Installation](#sec-1-1)
  - [Pools & Sessions](#sec-1-2)
  - [Class Methods](#sec-1-3)
  - [Bug Reports & Issues](#sec-1-4)
  - [Version History](#sec-1-5)


# PgHelper<a id="sec-1"></a>

A very simple abstraction over the `pg` and `pg-copy-streams` libraries to simplify working with a PostgreSQL database. Features include

-   Uses the `pg` connection pool for connections
-   Supports automatic or manual management of connections
-   Supports performing commands as part of the same session (connection). Useful for working with temporary tables and transaction blocks
-   Support for transactions and commit/rollback
-   Support for bulk data insert using the `\copy` command
-   Promise/async based interface

The library is by no means complete. It currently meets all my own use cases, but there is room for adding more functionality as required. Pull requests are welcome, but please ensure they include `Mocha` based tests. Functionality currently missing from this module includes;

-   No support for `copy from` i.e. using the COPY command to copy data *from* the database. Currently, only `copy to` is supported.
-   No support for the `pg` *config* based query form i.e. calling query with a config object. This form enables setting array mode for result sets, adding a name for prepared statement support, providing custom type parsers or setting a custom submit dispatcher. This functionality will likely be added in a future version.

This module is really just a wrapper around the `pg` and `pg-copy-streams` modules from NPM. Therefore, refer to the documentation for these modules for additional information on things like the structure of result sets returned from queries etc.

The current version is v1.0.0. It has been tested against PostgrSQL v12 using node v12.20.0.

## Installation<a id="sec-1-1"></a>

To install the module, just do

```shell
npm i pg-helper
```

## Pools & Sessions<a id="sec-1-2"></a>

This module uses connection pooling. This can have some implications when working with database transactions that either require all statements are executed within the same session, for example transaction blocks, or where the database state changes after the session ends, such as with temporary tables.

In a connection pool, each connection is a separate session. By default, if you call the methods in this module and do not pass in a connection object, the statement will be executed within its own session. Basically, you don't need to worry about getting a connection and then releasing it when your done. In many situation, this is sufficient. However, if you need to execute multiple statements and you need to ensure they are all executed within the same connection session, you need to manage the connection manually.

This means first obtaining a connection with `getConnection()` and then passing that object in as the last argument to other method calls. It also means you are responsible for releasing the connection once your done with it via a call to `releaseConnection(con)`.

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

```js
"use strict";

const dotenvPath = __dirname + "/../.env";
require("dotenv").config({ path: dotenvPath });

const PgHelper = require("pg-helper");

const db = new PgHelper();

let rslt = db.execSQL("SELECT * FROM my_table");
```

However, if you prefer to not use `dotenv` or environment variables, you can just pass in the `config` object e.g.

```js
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

The `config` object also supports a number of optional parameters which can be used to tweak the connection pool settings. The available properties are;

-   **connectionTimeoutMillis?::** Int. Number of milliseconds to wait before timing out when connecting a new client. Default 0 i.e. no timeout
-   **idleTimeoutMillis?:** Int. The number of milliseconds a client must sit idel in the pool before it is disconnected from the backend and discarded. Default 10000 e.g. 10 seconds
-   **max?::** Int. Maximum number of clients the pool should contain. Default 10.

### getConnection()<a id="sec-1-3-2"></a>

The `getconnection()` method returns a database connection from the connection pool. This can be useful if you want to manage the connection manually, which is sometimes necessary if you want to ensure all SQL runs within the same connection session (for example, when working with temporary tables). The other methods which execute SQL statements take an optional connection as the last argument. When no conneciton is passed in for these methods, the method will request one from the conneciton pool and release it after executing the SQL statement. When you pass in a connection, you are responsible for releasing that connection when you are finished with it.

### releaseConnection(con)<a id="sec-1-3-3"></a>

The `releaseConnection(con)` method is used to release the conneciton `con` back to the connection pool. After obtaining a connection with a call to `getConnection()`, you need to release it back to the pool once your finished using it.

-   **con:** a conneciton object obtained from a call to getConnection().

### close()<a id="sec-1-3-4"></a>

The `close()` method signals that your finished interacting with the database and want to release the connection pool. You should call this method before existing your script. Once you have called `close()` you cannot use the PgHelper object and should destroy it. If you need to re-connect, you will need to call `new PgHelper()`.

### execSQL(stmt, params, con)<a id="sec-1-3-5"></a>

The `execSQL(stmt, params, con)` method executes the statement defined in the `stmt` argument. The argument is a string. Statements can contain parameter placeholders using `$1, $2, ... $n`. When placeholder arguments are used, the optional `params` argument contains the values for the placeholders as an array of values. The optional `con` argument is a connection object returned from a call to `getConnection()`. If no `con` argument is supplied, the method will request a connection from the connection pool.

-   **stmt:** String. The SQL statement to executes
-   **params:** (Optional) Array. Parameter values to be substituted for $1, $2, &#x2026; $n placeholders in the SQL statement.
-   **con:** (Optional) Object. A connection object returned from a call to `getConnection()`

Examples

```js
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

### execTransactionSQL(stmt, params, con)<a id="sec-1-3-6"></a>

Similar to `execSQL()`, except the statement is executed inside a transaction block. If all executions of the statement succeed, the block is committed. If there are any errors, the block is rolled back.

The `stmt` argument is a string specifying an SQL command, usually with placeholder parameters (e.g. $1, $2, &#x2026; $n). The `params` argument is an array of array elements where each sub-array is a list of values to be used as values in the placeholder parameters. The `con` argument is an optional connection object, as returned from a call to `getconnection()`. If no `con` value is supplied, the method will request a new connection from the connection pool and release it back to the pool on completion.

The result set returned by the method is an accumulated result set where the `rowCount` property is the total rows affected by the transaction and the `rows` value is the accumulated rows returned by each statement execution.

-   **stmt:** String. The SQL statement to execute, possibly including $1 &#x2026; $n placeholder arguments.
-   **params:** (Optional) Array. An array of arrays where each sub-array contains the values to be used to replace placeholder parameters.
-   **con:** (Optional) Object. A connection object returned from a call to `getConnection`.

Example

```js
"use strict";

const dotenvPath = __dirname + "/../.env";
require("dotenv").config({ path: dotenvPath });

const PgHelper = require("pg-helper");

const db = new PgHelper();

const stmt = "UPDATE my_table SET col1 = $1 WHERE col2 = $2";
const params = [["val1", 20], ["val2", 30], ["val3", 40]];

db.execTransactionSQL(stmt, params)
  .then(rslt => {
    console.log(`${rslt.rowCount} rows updated`);
  })
  .catch(err => {
    console.log(err.message);
  });
```

### copyInsert(stmt, stringifyFn, data, con)<a id="sec-1-3-7"></a>

The `copyInsert(stmt, stringifyFn, data, con)` method uses the Postgres COPY command to insert records into a database table. For large record sets, this can be much faster than using standard SQL INSERT commands. The COPY statement format must comply with Postres COPY command (see Postgres documentation for details) For example

```sql
COPY my_table (col1, col2, col3, col4)
FROM STDIN WITH DELIMITER '\t' CSV QUOTE ''''
```

The above statement essentially says that the COPY command will expect records in a CSV format where fields are separated by a tab character with single quotes used for fields requiring quoting (like strings or dates). The stringifyFn will accept a record in whatever format you require and convert it into a string with values, like strings, quoted with single quotes and fields separated by a tab. The string should end with a newline character. Some values will need conversion to formats which Postgres will understand e.g. date strings or JSON data etc. This can be a little tricky to work out. Sometimes, it can be useful to write the data to a file in what you think is the correct format and then use psql to try inserting it into the database. This will sometimes provide error messages which are more meaningful and can be easier for experimentation.

The `data` argument is an array of records. The records can be in any format e.g. objects, arrays of data etc. All that is necessary is that the `stringifyFn` function is able to understand the format and generate the necessary string representation.

The `con` argument is a connection object returned by a call to `getConnection()`. If it is not supplied, the method will request a new connection from the connection pool and release it once the statement execution has completed.

The method returns a result set object with only one property, `rowCount`, the number of records inserted by the copy command. Note that the COPY command is an all or nothing command. The command is executed inside a transaction and if any errors occur, all inserts are rolled back.

-   **stmt:** String. A Postgres COPY statement.
-   **stringifyFn:** Function. A function of one argument which accepts a record and returns a suitable string representation for insertion using the COPY command.
-   **data:** Array. An array of data records to be inserted into the database
-   **con:** Object. A connection object as returned from a call to `getConnection()`.

Example

```js
"use strict";

const dotenvPath = __dirname + "/../.env";
require("dotenv").config({ path: dotenvPath });

const PgHelper = require("pg-helper");

// Could just use something like moment.js here!
const dateStr = (d) => {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  return `${year}-${month < 10 ? `0${month}` : month}-${
    day < 10 ? `0${day}` : day
  }`;
};

// SQL statement to execute to do insert using COPY
const stmt =
    "COPY my_table " +
    "(rec_date, rec_title, rec_cost, rec_order) " +
    "FROM STDIN DELIMITER '\t' CSV QUOTE ''''";

// Some data to insert
const data = [
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

const db = new PgHelper();

db.copyInsert(stmt, toString, data)
  .then(rslt => {
    console.log(`${rslt.rowCount} rows inserted`);
    return db.query("SELECT * FROM my_table");
  })
  .then(rslt => {
    for (let r of rslt.rows) {
      console.log(`ID: ${r.rec_id} Date: ${r.rec_date} Title: ${r.rec_title}`);
    }
    return db.close();
  })
  .catch(err => {
    console.error(err.message);
  });
```

### poolStatus()<a id="sec-1-3-8"></a>

Returns an object containing information about the current state of the connection pool. The object properties are;

-   **clientCount::** The current number of clients connected to the backend database
-   **idleCount::** The number of connections currently idel
-   **waitingCount::** The number of connection requests waiting to be satisfied

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

-   Version 1.0.0 <span class="timestamp-wrapper"><span class="timestamp">[2021-02-15 Mon]</span></span> Initial version.
