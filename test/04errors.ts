import { expect } from 'chai';
import {
  EasyPostgresError,
  ConnectionError,
  QueryError,
  TransactionError,
  CopyError,
} from '../src/errors.js';

describe('Error class contracts', function () {
  it('EasyPostgresError sets name and message', function () {
    const err = new EasyPostgresError('base error');
    expect(err.name).to.equal('EasyPostgresError');
    expect(err.message).to.equal('base error');
    expect(err).to.be.instanceOf(Error);
  });

  it('EasyPostgresError preserves cause', function () {
    const cause = new Error('original');
    const err = new EasyPostgresError('wrapper', cause);
    expect(err.cause).to.equal(cause);
  });

  it('ConnectionError is instanceof EasyPostgresError', function () {
    const err = new ConnectionError('conn failed');
    expect(err).to.be.instanceOf(ConnectionError);
    expect(err).to.be.instanceOf(EasyPostgresError);
    expect(err.name).to.equal('ConnectionError');
  });

  it('QueryError carries .sql property', function () {
    const err = new QueryError('query failed', 'SELECT 1', new Error('cause'));
    expect(err).to.be.instanceOf(QueryError);
    expect(err.name).to.equal('QueryError');
    expect(err.sql).to.equal('SELECT 1');
    expect(err.cause).to.be.instanceOf(Error);
  });

  it('TransactionError carries .sql property', function () {
    const err = new TransactionError('tx failed', 'INSERT INTO t VALUES ($1)', new Error('c'));
    expect(err).to.be.instanceOf(TransactionError);
    expect(err.name).to.equal('TransactionError');
    expect(err.sql).to.equal('INSERT INTO t VALUES ($1)');
  });

  it('CopyError is instanceof EasyPostgresError', function () {
    const err = new CopyError('copy failed');
    expect(err).to.be.instanceOf(CopyError);
    expect(err).to.be.instanceOf(EasyPostgresError);
    expect(err.name).to.equal('CopyError');
  });

  it('each subclass is not instanceof the others', function () {
    const conn = new ConnectionError('x');
    const query = new QueryError('x', 'SELECT 1');
    expect(conn).to.not.be.instanceOf(QueryError);
    expect(query).to.not.be.instanceOf(ConnectionError);
  });
});
