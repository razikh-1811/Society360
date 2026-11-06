const env = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');

async function start() {
  if (!env.jwtSecret) throw new Error('JWT_SECRET is not set');
  await connectDB();
  app.listen(env.port, () => console.log(`Society360 API listening on :${env.port}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
