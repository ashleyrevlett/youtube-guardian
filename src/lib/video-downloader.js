// Video downloader using yt-dlp binary
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {spawn} from 'child_process';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIDEOS_DIR = path.join(PROJECT_ROOT, 'data', 'videos');

// Rate limiting defaults
const DEFAULTS = {
  concurrency: 1,              // Sequential downloads only
  delayBetweenRequests: 1000,  // 1 second between downloads
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
 * Download video using yt-dlp binary
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<{filePath: string, fileSize: number}>}
 */
async function downloadVideo(videoId) {
  // Ensure videos directory exists
  if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, {recursive: true});
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputTemplate = path.join(VIDEOS_DIR, `${videoId}.mp4`);

  return new Promise((resolve, reject) => {
    // yt-dlp command with options for lowest quality MP4
    const args = [
      youtubeUrl,
      '-f', 'worst[ext=mp4]/worst',  // Get worst quality MP4 (smallest file)
      '-o', outputTemplate,           // Output filename
      '--no-playlist',                // Don't download playlists
      '--no-warnings',                // Suppress warnings
      '--quiet',                      // Minimal output
      '--progress'                    // Show progress
    ];

    const ytdlp = spawn('yt-dlp', args);

    let errorOutput = '';

    // Capture stderr for errors
    ytdlp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Capture stdout for progress (optional)
    ytdlp.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        // Optional: parse progress output
        // yt-dlp outputs progress like: [download]  45.2% of 12.34MiB at 1.23MiB/s ETA 00:05
        process.stdout.write(`\r  ${output}`);
      }
    });

    ytdlp.on('close', (code) => {
      process.stdout.write('\n'); // Clear progress line

      if (code === 0) {
        // Download successful, get file size
        if (fs.existsSync(outputTemplate)) {
          const stats = fs.statSync(outputTemplate);
          resolve({
            filePath: outputTemplate,
            fileSize: stats.size
          });
        } else {
          reject(new Error('Download completed but file not found'));
        }
      } else {
        // Download failed
        const error = errorOutput.trim() || `yt-dlp exited with code ${code}`;
        reject(new Error(error));
      }
    });

    ytdlp.on('error', (error) => {
      reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
    });
  });
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
 * @returns {Promise<{success: number, failed: number, skipped: number, totalSize: number, errors: Array}>}
 */
async function downloadAllVideos(videoIds) {
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    totalSize: 0,
    errors: []
  };

  console.log(`\nDownloading ${videoIds.length} videos using yt-dlp (sequential)...`);
  console.log(`Rate limits: ${DEFAULTS.delayBetweenRequests/1000}s between downloads, ${DEFAULTS.batchPauseMs/1000}s pause every ${DEFAULTS.batchSize} videos\n`);

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
      console.log(`${progress} Downloading ${videoId}...`);

      const {fileSize} = await downloadVideo(videoId);

      results.success++;
      results.totalSize += fileSize;

      console.log(`${progress} ✓ ${videoId} (${formatBytes(fileSize)})`);

      // Rate limit delay between downloads (except after last video)
      if (i + 1 < videoIds.length) {
        await sleep(DEFAULTS.delayBetweenRequests);
      }

      // Batch pause to avoid overwhelming system
      if ((i + 1) % DEFAULTS.batchSize === 0 && i + 1 < videoIds.length) {
        console.log(`\n  ⏸  Batch of ${DEFAULTS.batchSize} complete, pausing ${DEFAULTS.batchPauseMs/1000}s...\n`);
        await sleep(DEFAULTS.batchPauseMs);
      }

    } catch (error) {
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
