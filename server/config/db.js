const mongoose = require('mongoose');
const env = require('./env');

async function connectDB(uri = env.mongoUri) {
  if (!uri) throw new Error('MONGODB_URI is not set');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  return mongoose.connection;
}

module.exports = connectDB;
