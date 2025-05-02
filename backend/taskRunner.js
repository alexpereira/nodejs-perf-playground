const { Worker } = require('worker_threads');
const { performance } = require('perf_hooks');
const os = require('os');
const { logger } = require('./utils/logger');
const { setMetricsRefs } = require('./metrics');

const MAX_CONCURRENCY = os.cpus().length;

let activeTasks = 0;
let completedTasks = 0;
let taskQueue = [];
let taskDurations = [];

function runHeavyTask(taskSize) {
  return new Promise((resolve, reject) => {
    const task = { taskSize, resolve, reject };
    if (activeTasks < MAX_CONCURRENCY) {
      executeTask(task);
    } else {
      taskQueue.push(task);
      logger(`Task queued. Queue length: ${taskQueue.length}`);
    }
    setMetricsRefs({ taskQueue: [...taskQueue] });
  });
}

function executeTask({ taskSize, resolve, reject }) {
  const worker = new Worker('./worker.js', { workerData: { taskSize } });
  const startTime = performance.now();
  activeTasks++;
  logger(`Starting task (size: ${taskSize}). Active tasks: ${activeTasks}`);

  worker.on('message', (result) => {
    const endTime = performance.now();
    taskDurations.push(endTime - startTime);
    completedTasks++;
    activeTasks--;
    logger(`Task completed in ${(endTime - startTime).toFixed(2)} ms`);

    resolve(result);
    worker.terminate();

    if (taskQueue.length > 0) executeTask(taskQueue.shift());

    setMetricsRefs({ activeTasks, completedTasks, taskDurations, taskQueue: [...taskQueue] });
  });

  worker.on('error', (err) => {
    activeTasks--;
    logger(`Worker error: ${err.message}`);
    reject(err);
    worker.terminate();

    if (taskQueue.length > 0) executeTask(taskQueue.shift());

    setMetricsRefs({ activeTasks, taskQueue });
  });
}

module.exports = { runHeavyTask };
