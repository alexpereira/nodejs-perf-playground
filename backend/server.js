const http = require('http');
const { Worker } = require('worker_threads');
const { performance } = require('perf_hooks');
const os = require('os');
const { URL } = require('url');

let activeTasks = 0;
let completedTasks = 0;
let totalRequests = 0;
let taskDurations = [];
let startTime = performance.now();

function runHeavyTask(taskSize) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', { workerData: { taskSize } });
    const taskStartTime = performance.now();
    activeTasks++;

    worker.on('message', (result) => {
      const taskEndTime = performance.now();
      taskDurations.push(taskEndTime - taskStartTime);
      completedTasks++;
      activeTasks--;
      resolve(result);
    });

    worker.on('error', (err) => {
      activeTasks--;
      reject(err);
    });
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

  // Handle GET /metrics
  } else if (req.method === 'GET' && parsedUrl.pathname === '/metrics') {
    const endTime = performance.now();
    const uptime = endTime - startTime;
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();

    // Calculate average task duration
    const averageTaskDuration = taskDurations.length > 0
      ? taskDurations.reduce((acc, duration) => acc + duration, 0) / taskDurations.length
      : 0;

    // Collect metrics
    const metrics = {
      uptime: (uptime / 1000).toFixed(2), // server uptime in seconds
      cpuUsage: {
        user: cpuUsage.user / 1e6, // in seconds
        system: cpuUsage.system / 1e6, // in seconds
      },
      memoryUsage: {
        heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2), // in MB
        heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2), // in MB
        rss: (memoryUsage.rss / 1024 / 1024).toFixed(2), // in MB
      },
      activeTasks,
      completedTasks,
      averageTaskDuration: averageTaskDuration.toFixed(2), // in milliseconds
      totalRequests,
      systemInfo: {
        totalMemory: (os.totalmem() / 1024 / 1024).toFixed(2), // in MB
        freeMemory: (os.freemem() / 1024 / 1024).toFixed(2), // in MB
        cpuCount: os.cpus().length,
        loadAvg: os.loadavg(), // 1, 5, and 15 minute load average
      },
      timestamp: new Date().toISOString(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics, null, 2));
    
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(3001, () => {
  console.log('Performance Worker service running on http://localhost:3001');
});
