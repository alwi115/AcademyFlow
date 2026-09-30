const initialEnvironment = process.env.NODE_ENV;
function assertSafeTestUri(uri = process.env.MONGODB_URI) {
  if (initialEnvironment === 'production') throw new Error('Refusing destructive tests in production');
  if (typeof uri !== 'string' || !/^mongodb:\/\//.test(uri)) throw new Error('Tests require an isolated local MongoDB URI');
  const parsed = new URL(uri);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password ||
      !/^\/academyflow_[a-z0-9_]*test[a-z0-9_]*$/i.test(parsed.pathname) ||
      process.env.ALLOW_TEST_DB_RESET !== 'true' || process.env.NODE_ENV !== 'test') {
    throw new Error('Database reset requires NODE_ENV=test, ALLOW_TEST_DB_RESET=true and a local academyflow_*test* database');
  }
  return uri;
}
async function safeDropDatabase(connection) {
  assertSafeTestUri();
  if (!/^academyflow_[a-z0-9_]*test[a-z0-9_]*$/i.test(connection.db.databaseName)) throw new Error('Connected database is not an approved test database');
  // Mongoose initializes collections asynchronously after connect; never race a drop.
  const models = Object.values(connection.models);
  await Promise.all(models.map(model => model.init()));
  const result = await connection.db.dropDatabase();
  for (const model of models) {
    await model.createCollection();
    await model.createIndexes();
  }
  return result;
}
module.exports = { assertSafeTestUri, safeDropDatabase };
