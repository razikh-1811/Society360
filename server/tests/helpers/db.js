const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';

// Tests need a real MongoDB. Set MONGODB_URI_TEST (e.g. mongodb://127.0.0.1:27018/society360_test).
async function connect(dbName) {
  const base = process.env.MONGODB_URI_TEST;
  if (!base) throw new Error('MONGODB_URI_TEST is not set');
  await mongoose.connect(base.replace(/\/[^/]*$/, `/${dbName}`));
  await mongoose.connection.dropDatabase();
}
async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
async function clear() {
  const cols = await mongoose.connection.db.collections();
  await Promise.all(cols.map((c) => c.deleteMany({})));
}
module.exports = { connect, disconnect, clear };
