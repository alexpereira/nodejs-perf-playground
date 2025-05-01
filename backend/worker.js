const { workerData, parentPort } = require('worker_threads');

// Simulate heavy computation
function compute(n) {
  let count = 0;
  for (let i = 0; i < n; i++) {
    count += Math.sqrt(i);
  }
  return count;
}

const result = compute(workerData.taskSize);
parentPort.postMessage(result);