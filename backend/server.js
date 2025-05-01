const http = require('http');
const { Worker } = require('worker_threads');
const { performance } = require('perf_hooks');
const os = require('os');
const { URL } = require('url');

const {
  getMetrics,
  broadcastMetrics,
  addSseClient,
  removeSseClient,
  setMetricsRefs
} = require('./metrics');

const MAX_CONCURRENCY = os.cpus().length;

let startTime = performance.now();

let activeTasks = 0;
let completedTasks = 0;
let totalRequests = 0;
let taskDurations = [];
let taskQueue = [];

function miniLogger(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

setInterval(broadcastMetrics, 1000); // Broadcast metric updates every second

function runHeavyTask(taskSize) {
  return new Promise((resolve, reject) => {
    const task = { taskSize, resolve, reject };
    if (activeTasks < MAX_CONCURRENCY) {
      executeTask(task);
    } else {
      taskQueue.push(task);
      miniLogger(`Task queued. Queue length: ${taskQueue.length}`);
    }
    setMetricsRefs({ taskQueue });
  });
}

function executeTask({ taskSize, resolve, reject }) {
  const worker = new Worker('./worker.js', { workerData: { taskSize } });
  const taskStartTime = performance.now();
  activeTasks++;
  miniLogger(`Starting task (size: ${taskSize}). Active tasks: ${activeTasks}`);

  worker.on('message', (result) => {
    const taskEndTime = performance.now();
    taskDurations.push(taskEndTime - taskStartTime);
    completedTasks++;
    activeTasks--;
    miniLogger(`Task completed in ${(taskEndTime - taskStartTime).toFixed(2)} ms. Active: ${activeTasks}`);

    resolve(result);
    worker.terminate();

    // Run next queued task
    if (taskQueue.length > 0) {
      const nextTask = taskQueue.shift();
      executeTask(nextTask);
    }

    setMetricsRefs({ activeTasks, completedTasks, taskDurations, taskQueue });
  });

  worker.on('error', (err) => {
    activeTasks--;
    miniLogger(`Worker error: ${err.message}`);
    reject(err);
    worker.terminate();

    // Run next queued task
    if (taskQueue.length > 0) {
      const nextTask = taskQueue.shift();
      executeTask(nextTask);
    }

    setMetricsRefs({ activeTasks, taskQueue });
  });
}

const server = http.createServer(async (req, res) => {
  // Set headers for CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  totalRequests++;

  // Handle POST /do-task
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

  // Handle GET /metrics-stream
  } else if (req.method === 'GET' && parsedUrl.pathname === '/metrics-stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write('\n');
    addSseClient(res);
    miniLogger('SSE client connected');

    req.on('close', () => {
      removeSseClient(res);
      miniLogger('SSE client disconnected');
    });

  // Handle GET /metrics
  } else if (req.method === 'GET' && parsedUrl.pathname === '/metrics') {
    const metrics = getMetrics();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics, null, 2));    
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }

  setMetricsRefs({ totalRequests });
});

server.listen(3001, () => {
  miniLogger('Performance Worker service running on http://localhost:3001');
});
