const http = require('http');

const { handleRequest } = require('./routes');
const { logger } = require('./utils/logger');
const { broadcastMetrics } = require('./metrics');

setInterval(broadcastMetrics, 250); // Broadcast metric updates every 250 milisecond

const server = http.createServer(handleRequest);

server.listen(3001, () => {
  logger('Performance Worker service running on http://localhost:3001');
});
