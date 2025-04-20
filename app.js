require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes/api');
const logger = require('./utils/logger');
const whiskyModel = require('./models/whiskyModel');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
app.use(express.json());
app.use(logger.requestLogger);

// Routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    dataLoaded: whiskyModel.whiskies.length > 0
  });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Server error:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    requestId: req.id
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await whiskyModel.loadWhiskies();
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Data loaded: ${whiskyModel.whiskies.length} whiskies`);
});

module.exports = app;