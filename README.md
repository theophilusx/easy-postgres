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

## Installation<a id="sec-1-1"></a>

## Basic Examples<a id="sec-1-2"></a>

## Class Methods<a id="sec-1-3"></a>

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
