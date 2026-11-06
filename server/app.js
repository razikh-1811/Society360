const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.clientOrigin.split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '5mb' }));
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'society360-api' }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/flats', require('./routes/flatRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
// Further feature routers are mounted here as modules are added.

app.use(notFound);
app.use(errorHandler);

module.exports = app;
