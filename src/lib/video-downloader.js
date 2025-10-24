// Video downloader with rate limiting for third-party YouTube API
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {pipeline} from 'stream/promises';
import {createWriteStream} from 'fs';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIDEOS_DIR = path.join(PROJECT_ROOT, 'data', 'videos');

// Rate limiting defaults
const DEFAULTS = {
  concurrency: 1,              // Sequential downloads only
  delayBetweenRequests: 1000,  // 1 second between API calls
  timeout: 30000,              // 30 second timeout
  maxRetries: 3,               // Max retry attempts
  retryDelay: 2000,            // Initial retry delay (2s, 4s, 8s...)
  batchSize: 10,               // Download in batches of 10
  batchPauseMs: 5000           // 5 second pause between batches
};

/**
 * Sleep utility for delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Fetch video MP4 URL from third-party API with retry and exponential backoff
 * @param {string} videoId - YouTube video ID
 * @param {string} apiEndpoint - Third-party API endpoint
 * @param {number} attempt - Current retry attempt
 * @returns {Promise<{url: string, quality: string}>}
 */
async function fetchVideoUrl(videoId, apiEndpoint, attempt = 1) {
  try {
    // Construct YouTube URL from video ID
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULTS.timeout);

    // POST request with YouTube URL in body
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({url: youtubeUrl})
    });

    clearTimeout(timeoutId);

    // Check for rate limiting
    if (response.status === 429 || response.status === 503) {
      if (attempt >= DEFAULTS.maxRetries) {
        throw new Error('Rate limited - max retries exceeded');
      }

      const delay = DEFAULTS.retryDelay * Math.pow(2, attempt - 1);
      console.log(`  ⏸  Rate limited (${response.status}), waiting ${delay/1000}s before retry...`);
      await sleep(delay);
      return fetchVideoUrl(videoId, apiEndpoint, attempt + 1);
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Check for API errors
    if (data.error) {
      throw new Error(`API error: ${data.error}`);
    }

    // Extract MP4 URL from response - find lowest resolution MP4 video
    let mp4Url = null;
    let selectedMedia = null;

    if (data.medias && Array.isArray(data.medias)) {
      // Filter to only MP4 video formats
      const mp4Videos = data.medias.filter(m =>
        m.type === 'video' &&
        m.ext === 'mp4' &&
        m.width &&
        m.height &&
        m.url
      );

      if (mp4Videos.length > 0) {
        // Sort by resolution (width * height) ascending, pick the smallest
        mp4Videos.sort((a, b) => (a.width * a.height) - (b.width * b.height));
        selectedMedia = mp4Videos[0];
        mp4Url = selectedMedia.url;
      }
    }

    // Fallback: try direct URL fields if medias array not found
    if (!mp4Url) {
      mp4Url = data.url || data.downloadUrl || data.mp4Url || data.link;
    }

    if (!mp4Url) {
      throw new Error('No MP4 URL found in API response');
    }

    return {
      url: mp4Url,
      quality: selectedMedia?.quality || selectedMedia?.label || 'lowest',
      width: selectedMedia?.width,
      height: selectedMedia?.height,
      format: 'mp4'
    };

  } catch (error) {
    // Handle network errors with retry
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }

    if (attempt < DEFAULTS.maxRetries && !error.message.includes('Rate limited')) {
      const delay = DEFAULTS.retryDelay * Math.pow(2, attempt - 1);
      console.log(`  ⚠️  Error: ${error.message}, retrying in ${delay/1000}s...`);
      await sleep(delay);
      return fetchVideoUrl(videoId, apiEndpoint, attempt + 1);
    }

    throw error;
  }
}

/**
 * Resolve redirect URL to final destination
 * @param {string} url - URL that may redirect
 * @returns {Promise<string>} Final resolved URL
 */
async function resolveRedirectUrl(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULTS.timeout);

    // Make HEAD request to follow redirects without downloading
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow' // Follow redirects automatically
    });

    clearTimeout(timeoutId);

    // Return the final URL after all redirects
    return response.url;
  } catch (error) {
    // If HEAD fails, return original URL and let download handle it
    console.log(`  ⚠️  Could not resolve redirect: ${error.message}, using original URL`);
    return url;
  }
}

/**
 * Download MP4 file from URL to local storage
 * @param {string} videoId - YouTube video ID (used for filename)
 * @param {string} mp4Url - Direct URL to MP4 file (may be a redirect)
 * @returns {Promise<{filePath: string, fileSize: number}>}
 */
async function downloadVideo(videoId, mp4Url) {
  // Ensure videos directory exists
  if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, {recursive: true});
  }

  const filePath = path.join(VIDEOS_DIR, `${videoId}.mp4`);

  try {
    // Resolve redirects first to get final URL
    const resolvedUrl = await resolveRedirectUrl(mp4Url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULTS.timeout * 2); // Longer timeout for download

    const response = await fetch(resolvedUrl, {signal: controller.signal});
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    // Stream download to file
    await pipeline(response.body, createWriteStream(filePath));

    // Get file size
    const stats = fs.statSync(filePath);

    return {
      filePath,
      fileSize: stats.size
    };

  } catch (error) {
    // Clean up partial download
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw error;
  }
}

/**
 * Check if video is already downloaded
 * @param {string} videoId - YouTube video ID
 * @returns {boolean}
 */
function isVideoDownloaded(videoId) {
  const filePath = path.join(VIDEOS_DIR, `${videoId}.mp4`);
  return fs.existsSync(filePath);
}

/**
 * Download all videos with rate limiting and batch processing
 * @param {string[]} videoIds - Array of YouTube video IDs
 * @param {string} apiEndpoint - Third-party API endpoint
 * @returns {Promise<{success: number, failed: number, skipped: number, totalSize: number, rateLimited: number}>}
 */
async function downloadAllVideos(videoIds, apiEndpoint) {
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    totalSize: 0,
    rateLimited: 0,
    errors: []
  };

  console.log(`\nDownloading ${videoIds.length} videos (sequential with rate limiting)...`);
  console.log(`Rate limits: ${DEFAULTS.delayBetweenRequests/1000}s between requests, ${DEFAULTS.batchPauseMs/1000}s pause every ${DEFAULTS.batchSize} videos\n`);

  const startTime = Date.now();

  for (let i = 0; i < videoIds.length; i++) {
    const videoId = videoIds[i];
    const progress = `[${i + 1}/${videoIds.length}]`;

    // Check if already downloaded
    if (isVideoDownloaded(videoId)) {
      console.log(`${progress} ⊘ ${videoId} - Already downloaded, skipping`);
      results.skipped++;
      continue;
    }

    try {
      console.log(`${progress} Fetching URL for ${videoId}...`);

      // Step 1: Fetch MP4 URL from API
      const {url} = await fetchVideoUrl(videoId, apiEndpoint);

      // Rate limit delay before download
      await sleep(DEFAULTS.delayBetweenRequests);

      // Step 2: Download the video
      console.log(`${progress} Downloading ${videoId}...`);
      const {fileSize} = await downloadVideo(videoId, url);

      results.success++;
      results.totalSize += fileSize;

      console.log(`${progress} ✓ ${videoId} (${formatBytes(fileSize)})`);

      // Batch pause to avoid overwhelming API
      if ((i + 1) % DEFAULTS.batchSize === 0 && i + 1 < videoIds.length) {
        console.log(`\n  ⏸  Batch of ${DEFAULTS.batchSize} complete, pausing ${DEFAULTS.batchPauseMs/1000}s to avoid rate limits...\n`);
        await sleep(DEFAULTS.batchPauseMs);
      }

    } catch (error) {
      // Check if rate limited
      if (error.message.includes('Rate limited')) {
        results.rateLimited++;
        console.log(`${progress} ✗ ${videoId} - ${error.message}`);
        console.log(`\n⚠️  Stopping downloads to avoid API ban. Run again later to resume.\n`);
        results.errors.push({videoId, error: error.message});
        break; // Stop entirely if rate limited
      }

      results.failed++;
      console.log(`${progress} ✗ ${videoId} - ${error.message}`);
      results.errors.push({videoId, error: error.message});
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgTime = videoIds.length > 0 ? (duration / videoIds.length).toFixed(1) : 0;

  console.log('\n' + '='.repeat(60));
  console.log('\nDownload Summary:');
  console.log(`  ✓ Downloaded: ${results.success} videos (${formatBytes(results.totalSize)})`);
  console.log(`  ⊘ Skipped: ${results.skipped} videos (already downloaded)`);
  console.log(`  ✗ Failed: ${results.failed} videos`);
  if (results.rateLimited > 0) {
    console.log(`  ⚠️  Rate limited: ${results.rateLimited} times`);
  }
  console.log(`  ⏱  Total time: ${duration}s (avg ${avgTime}s per video)`);
  console.log();

  return results;
}

/**
 * Get list of downloaded video IDs
 * @returns {string[]} Array of video IDs
 */
function getDownloadedVideos() {
  if (!fs.existsSync(VIDEOS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(VIDEOS_DIR);
  return files
    .filter(f => f.endsWith('.mp4'))
    .map(f => f.replace('.mp4', ''));
}

/**
 * Delete a specific downloaded video
 * @param {string} videoId - YouTube video ID
 * @returns {boolean} True if deleted
 */
function deleteVideo(videoId) {
  const filePath = path.join(VIDEOS_DIR, `${videoId}.mp4`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Clean up all downloaded videos
 * @returns {number} Count of deleted files
 */
function cleanupAllVideos() {
  if (!fs.existsSync(VIDEOS_DIR)) {
    return 0;
  }

  const files = fs.readdirSync(VIDEOS_DIR);
  const mp4Files = files.filter(f => f.endsWith('.mp4'));

  for (const file of mp4Files) {
    fs.unlinkSync(path.join(VIDEOS_DIR, file));
  }

  return mp4Files.length;
}

/**
 * Get total size of downloaded videos
 * @returns {number} Total size in bytes
 */
function getTotalSize() {
  if (!fs.existsSync(VIDEOS_DIR)) {
    return 0;
  }

  const files = fs.readdirSync(VIDEOS_DIR);
  let totalSize = 0;

  for (const file of files) {
    if (file.endsWith('.mp4')) {
      const stats = fs.statSync(path.join(VIDEOS_DIR, file));
      totalSize += stats.size;
    }
  }

  return totalSize;
}

export {
  downloadAllVideos,
  isVideoDownloaded,
  getDownloadedVideos,
  deleteVideo,
  cleanupAllVideos,
  getTotalSize,
  formatBytes,
  VIDEOS_DIR
};
