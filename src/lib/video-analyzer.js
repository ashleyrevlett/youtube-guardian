import 'dotenv/config';
import {google} from 'googleapis';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is two levels up from src/lib/
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Load service account key file path from .env
const SERVICE_ACCOUNT_KEY_FILE = process.env.SERVICE_ACCOUNT_KEY_FILE || path.join(PROJECT_ROOT, 'service-account-key.json');

/**
 * Authenticate using a service account
 */
async function authenticateServiceAccount() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
  });
  const authClient = await auth.getClient();
  return authClient;
}

/**
 * Get an authenticated YouTube API client
 */
async function getYouTubeClient() {
  const authClient = await authenticateServiceAccount();
  const youtube = google.youtube({
    version: 'v3',
    auth: authClient,
  });
  return youtube;
}

/**
 * Fetch detailed information for a batch of video IDs
 * @param {string[]} videoIds - Array of video IDs to fetch
 * @returns {Promise<Object[]>} Array of video details
 */
async function fetchVideoBatch(videoIds) {
  try {
    const youtube = await getYouTubeClient();

    // YouTube API allows up to 50 video IDs per request
    const res = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics', 'status'],
      id: videoIds,
    });

    return res.data.items || [];
  } catch (error) {
    console.error(`Error fetching video batch:`, error.message);
    return [];
  }
}

/**
 * Fetch channel information
 * @param {string} channelId - Channel ID to fetch
 * @returns {Promise<Object>} Channel details
 */
async function fetchChannelInfo(channelId) {
  try {
    const youtube = await getYouTubeClient();

    const res = await youtube.channels.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: [channelId],
    });

    return res.data.items?.[0] || null;
  } catch (error) {
    console.error(`Error fetching channel ${channelId}:`, error.message);
    return null;
  }
}

/**
 * Process video data and extract relevant information
 * @param {Object} video - Raw video data from YouTube API
 * @returns {Object} Processed video information
 */
function processVideoData(video) {
  const snippet = video.snippet || {};
  const contentDetails = video.contentDetails || {};
  const statistics = video.statistics || {};
  const status = video.status || {};

  return {
    id: video.id,
    title: snippet.title,
    description: snippet.description,
    channelId: snippet.channelId,
    channelTitle: snippet.channelTitle,
    publishedAt: snippet.publishedAt,
    tags: snippet.tags || [],
    categoryId: snippet.categoryId,

    // Content details
    duration: contentDetails.duration,
    hasCaption: contentDetails.caption === 'true',
    contentRating: contentDetails.contentRating || {},
    regionRestriction: contentDetails.regionRestriction,

    // Statistics
    viewCount: parseInt(statistics.viewCount || 0),
    likeCount: parseInt(statistics.likeCount || 0),
    commentCount: parseInt(statistics.commentCount || 0),

    // Status
    privacyStatus: status.privacyStatus,
    madeForKids: status.madeForKids,
    embeddable: status.embeddable,

    // Metadata
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Analyze all videos from the parsed watch history
 * @param {string} videoIdsPath - Path to video-ids.json
 * @param {string} outputPath - Path to save detailed results
 */
async function analyzeVideos(videoIdsPath, outputPath) {
  console.log('📺 YouTube Guardian - Video Analyzer');
  console.log('=====================================\n');

  // Load video IDs
  const videoData = JSON.parse(fs.readFileSync(videoIdsPath, 'utf-8'));
  const videoIds = videoData.map(v => v.videoId);

  console.log(`Found ${videoIds.length} videos to analyze\n`);

  // Check if cache exists
  let cache = {};
  if (fs.existsSync(outputPath)) {
    cache = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    console.log(`Loaded ${Object.keys(cache).length} cached videos\n`);
  }

  // Filter out already cached videos
  const uncachedIds = videoIds.filter(id => !cache[id]);

  if (uncachedIds.length === 0) {
    console.log('✓ All videos already cached!\n');
    return cache;
  }

  console.log(`Fetching details for ${uncachedIds.length} new videos...`);

  // Process in batches of 50 (API limit)
  const batchSize = 50;
  const results = {};

  for (let i = 0; i < uncachedIds.length; i += batchSize) {
    const batch = uncachedIds.slice(i, i + batchSize);
    console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uncachedIds.length / batchSize)}...`);

    const videos = await fetchVideoBatch(batch);

    for (const video of videos) {
      const processed = processVideoData(video);
      results[video.id] = processed;
    }

    // Rate limiting: wait 1 second between batches
    if (i + batchSize < uncachedIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Merge with cache
  const allResults = {...cache, ...results};

  // Save to file
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
  console.log(`\n✓ Saved ${Object.keys(allResults).length} video details to ${outputPath}\n`);

  return allResults;
}

export {analyzeVideos, fetchVideoBatch, fetchChannelInfo, processVideoData, getYouTubeClient};
