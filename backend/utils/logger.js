function miniLogger(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

module.exports = { logger: miniLogger };