const os = require("node:os");

let previousCpuSample = readCpuSample();

function collectSystemMetrics() {
  const collectedAt = new Date();
  const cpuPercent = readCpuPercent();
  const memory = readMemory();

  return {
    collectedAt: collectedAt.toISOString(),
    cpu: {
      percent: cpuPercent,
      cores: os.cpus().length
    },
    memory,
    process: readProcessMemory(),
    uptimeSeconds: Math.round(os.uptime())
  };
}

function readCpuPercent() {
  const current = readCpuSample();
  const previous = previousCpuSample;
  previousCpuSample = current;

  const idleDelta = current.idle - previous.idle;
  const totalDelta = current.total - previous.total;
  if (totalDelta <= 0) return null;
  return roundPercent(100 - (idleDelta / totalDelta) * 100);
}

function readCpuSample() {
  return os.cpus().reduce(
    (acc, cpu) => {
      const times = cpu.times;
      const total = Object.values(times).reduce((sum, value) => sum + value, 0);
      acc.idle += times.idle;
      acc.total += total;
      return acc;
    },
    { idle: 0, total: 0 }
  );
}

function readMemory() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const usedPercent = totalBytes ? roundPercent((usedBytes / totalBytes) * 100) : null;
  const freePercent = totalBytes ? roundPercent((freeBytes / totalBytes) * 100) : null;

  return {
    totalBytes,
    freeBytes,
    usedBytes,
    usedPercent,
    freePercent
  };
}

function readProcessMemory() {
  const usage = process.memoryUsage();
  return {
    rssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    heapTotalBytes: usage.heapTotal,
    externalBytes: usage.external
  };
}

function roundPercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

module.exports = {
  collectSystemMetrics
};
