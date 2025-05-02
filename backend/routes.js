const { URL } = require('url');
const { runHeavyTask } = require('./taskRunner');
const { getMetrics, addSseClient, removeSseClient, setMetricsRefs } = require('./metrics');
const { logger } = require('./utils/logger');

async function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  // Handle routes
  if (req.method === 'POST' && parsedUrl.pathname === '/do-task') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      try {
        const { taskSize } = JSON.parse(body);
        const result = await runHeavyTask(taskSize);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to run task' }));
      }
    });
  } else if (req.method === 'GET' && parsedUrl.pathname === '/metrics-stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('\n');
    addSseClient(res);
    logger('SSE client connected');
    req.on('close', () => {
      removeSseClient(res);
      logger('SSE client disconnected');
    });
  } else if (req.method === 'GET' && parsedUrl.pathname === '/metrics') {
    const metrics = getMetrics();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics, null, 2));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }

  setMetricsRefs(prev => ({
    totalRequests: prev.totalRequests + 1
  }));
}

module.exports = { handleRequest };
