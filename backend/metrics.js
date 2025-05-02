const os = require('os');
const { performance } = require('perf_hooks');

let metricsState = {
  startTime: performance.now(),
  activeTasks: 0,
  completedTasks: 0,
  totalRequests: 0,
  taskDurations: [],
  taskQueue: [],
};
const sseClients = new Set();

function getMetrics() {
  const { startTime, activeTasks, completedTasks, totalRequests, taskDurations, taskQueue } = metricsState;
  const endTime = performance.now();
  const uptime = endTime - startTime;
  const cpuUsage = process.cpuUsage();
  const memoryUsage = process.memoryUsage();
  const averageTaskDuration = taskDurations.length > 0
    ? taskDurations.reduce((acc, d) => acc + d, 0) / taskDurations.length
    : 0;

  return {
    uptime: (uptime / 1000).toFixed(2),
    cpuUsage: {
      user: cpuUsage.user / 1e6,
      system: cpuUsage.system / 1e6,
    },
    memoryUsage: {
      heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
      rss: (memoryUsage.rss / 1024 / 1024).toFixed(2),
    },
    activeTasks,
    completedTasks,
    queuedTasks: taskQueue.length,
    averageTaskDuration: averageTaskDuration.toFixed(2),
    totalRequests,
    systemInfo: {
      totalMemory: (os.totalmem() / 1024 / 1024).toFixed(2),
      freeMemory: (os.freemem() / 1024 / 1024).toFixed(2),
      cpuCount: os.cpus().length,
      loadAvg: os.loadavg(),
    },
    timestamp: new Date().toISOString(),
  };
}

function broadcastMetrics() {
  const metrics = getMetrics();
  const data = `data: ${JSON.stringify(metrics)}\n\n`;

  for (const res of sseClients) {
    res.write(data);
  }
}

function addSseClient(res) {
  sseClients.add(res);
}

function removeSseClient(res) {
  sseClients.delete(res);
}

function setMetricsRefs(update) {
  if (typeof update === 'function') {
    const newState = update({ ...metricsState }); // clone to prevent accidental mutation
    Object.assign(metricsState, newState);
  } else if (typeof update === 'object') {
    Object.assign(metricsState, update);
  } else {
    throw new Error('setMetricsRefs expects an object or a function');
  }
}

module.exports = {
  getMetrics,
  broadcastMetrics,
  addSseClient,
  removeSseClient,
  setMetricsRefs,
};
