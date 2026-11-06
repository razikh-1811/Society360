require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  // ASSUMPTION: late-fee policy is not specified by the client. These are demo defaults.
  lateFeeGraceDays: Number(process.env.LATE_FEE_GRACE_DAYS ?? 10),
  lateFeePercentPerMonth: Number(process.env.LATE_FEE_PERCENT_PER_MONTH ?? 1.5),
};

module.exports = env;
