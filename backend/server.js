require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./src/config/db');
const authRoutes = require('./src/routes/auth.routes');
const captchaRoutes = require('./src/routes/captcha.routes');
const walletRoutes = require('./src/routes/wallet.routes');
const securityRoutes = require('./src/routes/security.routes');
const rateLimiter = require('./src/middleware/rateLimiter');

const app = express();
// Render/Railway inject PORT; locally it falls back to 5000.
const PORT = process.env.PORT || 5000;

/**
 * CORS.
 *
 * Locally there is no frontend origin to restrict, so everything is
 * allowed. In production set ALLOWED_ORIGINS to your deployed frontend URL
 * (comma separated) and the API will refuse anything else - an open CORS
 * policy is the kind of thing a reviewer will flag.
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(rateLimiter);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'VELoop Rewards API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/captcha', captchaRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/security', securityRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    code: err.code || 'SERVER_ERROR'
  });
});

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`VELoop Rewards API listening on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = app;
