/**
 * Background Job Service
 * Handles long-running operations that exceed Heroku's 30-second timeout
 * Uses Redis for job queue and status tracking, with in-memory fallback
 */

const { setCache, getCache, deleteCache, isAvailable: isRedisAvailable } = require('../config/redis');
const aiWidgetAnalysis = require('./aiWidgetAnalysis');

/**
 * Job statuses
 */
const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * In-memory job store (fallback when Redis is unavailable)
 * Jobs are automatically cleaned up after 10 minutes
 */
const inMemoryJobs = new Map();
const JOB_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cleanupExpiredJobs() {
  const now = Date.now();
  for (const [jobId, job] of inMemoryJobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) {
      inMemoryJobs.delete(jobId);
      console.log(`[Background Job] Cleaned up expired job: ${jobId}`);
    }
  }
}

// Clean up expired jobs every minute
setInterval(cleanupExpiredJobs, 60 * 1000);

/**
 * Set job data (Redis with in-memory fallback)
 */
async function setJobData(jobId, key, value) {
  const fullKey = `job:${jobId}:${key}`;

  // Try Redis first
  const redisSuccess = await setCache(fullKey, value, 600);

  // Always update in-memory store as fallback
  if (!inMemoryJobs.has(jobId)) {
    inMemoryJobs.set(jobId, { createdAt: Date.now() });
  }
  const job = inMemoryJobs.get(jobId);
  job[key] = value;

  if (!redisSuccess) {
    console.log(`[Background Job] Redis unavailable, using in-memory store for job ${jobId}`);
  }

  return true;
}

/**
 * Get job data (Redis with in-memory fallback)
 */
async function getJobData(jobId, key) {
  const fullKey = `job:${jobId}:${key}`;

  // Try Redis first
  const redisValue = await getCache(fullKey);
  if (redisValue !== null && redisValue !== undefined) {
    return redisValue;
  }

  // Fallback to in-memory
  const job = inMemoryJobs.get(jobId);
  const value = job ? job[key] : null;

  return value;
}

/**
 * Delete job data
 */
async function deleteJobData(jobId, key) {
  const fullKey = `job:${jobId}:${key}`;
  await deleteCache(fullKey);

  // Also clean from in-memory
  const job = inMemoryJobs.get(jobId);
  if (job) {
    delete job[key];
  }
}

/**
 * Create a background job for AI widget analysis
 *
 * @param {string} jobId - Unique job identifier
 * @param {Object} widget - Widget configuration
 * @param {Object} metricsData - Metrics data
 * @param {Object} options - Analysis options
 * @returns {Promise<void>}
 */
async function processAIAnalysisJob(jobId, widget, metricsData, options = {}) {
  try {
    // Update status to processing
    await setJobData(jobId, 'status', JOB_STATUS.PROCESSING);
    await setJobData(jobId, 'progress', 'Analyzing widget data with AI...');

    console.log(`[Background Job] Processing job ${jobId}...`);

    // Perform the actual AI analysis (this can take 30+ seconds)
    const analysis = await aiWidgetAnalysis.analyzeWidget(widget, metricsData, options);

    // Check if analysis returned an error (e.g., AI service not configured)
    if (analysis && analysis.success === false) {
      console.error(`[Background Job] AI analysis job ${jobId} returned error:`, analysis.error);
      await setJobData(jobId, 'status', JOB_STATUS.FAILED);
      await setJobData(jobId, 'error', analysis.error || 'AI analysis failed');
      await deleteJobData(jobId, 'progress');
      return;
    }

    // Store results
    await setJobData(jobId, 'status', JOB_STATUS.COMPLETED);
    await setJobData(jobId, 'result', JSON.stringify(analysis));
    await deleteJobData(jobId, 'progress');

    console.log(`[Background Job] AI analysis job ${jobId} completed successfully`);
  } catch (error) {
    console.error(`[Background Job] AI analysis job ${jobId} failed:`, error);
    console.error(`[Background Job] Stack trace:`, error.stack);

    await setJobData(jobId, 'status', JOB_STATUS.FAILED);
    await setJobData(jobId, 'error', error.message || 'Unknown error occurred');
    await deleteJobData(jobId, 'progress');
  }
}

/**
 * Start an AI analysis background job
 *
 * @param {string} jobId - Unique job identifier
 * @param {Object} widget - Widget configuration
 * @param {Object} metricsData - Metrics data
 * @param {Object} options - Analysis options
 */
function startAIAnalysisJob(jobId, widget, metricsData, options = {}) {
  // Set initial status using the helper function
  setJobData(jobId, 'status', JOB_STATUS.PENDING);

  // Start processing in background (don't await)
  processAIAnalysisJob(jobId, widget, metricsData, options).catch(err => {
    console.error(`[Background Job] Unhandled error in job ${jobId}:`, err);
    // Make sure we mark the job as failed
    setJobData(jobId, 'status', JOB_STATUS.FAILED);
    setJobData(jobId, 'error', err.message || 'Unhandled error');
  });

  console.log(`[Background Job] AI analysis job ${jobId} started`);
}

/**
 * Get job status and results
 *
 * @param {string} jobId - Job identifier
 * @returns {Promise<Object>} Job information
 */
async function getJobStatus(jobId) {
  const status = await getJobData(jobId, 'status');

  if (!status) {
    return {
      status: 'not_found',
      message: 'Job not found or expired',
    };
  }

  const result = {
    status,
    jobId,
  };

  if (status === JOB_STATUS.PROCESSING) {
    const progress = await getJobData(jobId, 'progress');
    result.progress = progress || 'Processing...';
  }

  if (status === JOB_STATUS.COMPLETED) {
    const resultData = await getJobData(jobId, 'result');
    try {
      result.data = resultData ? (typeof resultData === 'string' ? JSON.parse(resultData) : resultData) : null;
    } catch (e) {
      console.error(`[Background Job] Failed to parse result for job ${jobId}:`, e);
      result.data = null;
    }
  }

  if (status === JOB_STATUS.FAILED) {
    const error = await getJobData(jobId, 'error');
    result.error = error || 'Unknown error';
  }

  return result;
}

/**
 * Clean up job data
 *
 * @param {string} jobId - Job identifier
 */
async function cleanupJob(jobId) {
  await deleteJobData(jobId, 'status');
  await deleteJobData(jobId, 'result');
  await deleteJobData(jobId, 'error');
  await deleteJobData(jobId, 'progress');

  // Also remove from in-memory
  inMemoryJobs.delete(jobId);
}

module.exports = {
  JOB_STATUS,
  startAIAnalysisJob,
  getJobStatus,
  cleanupJob,
};
