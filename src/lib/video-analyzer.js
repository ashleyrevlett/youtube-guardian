import 'dotenv/config';
import {google} from 'googleapis';
import path from 'path';
import {fileURLToPath} from 'url';
import {db, videos, watchHistory} from '../db/index.js';
import {notInArray, sql} from 'drizzle-orm';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVICE_ACCOUNT_KEY = process.env.SERVICE_ACCOUNT_KEY_FILE || path.join(PROJECT_ROOT, 'service-account-key.json');

// Single YouTube client instance
let youtubeClient;

async function getYouTubeClient() {
  if (!youtubeClient) {
    const auth = new google.auth.GoogleAuth({
      keyFile: SERVICE_ACCOUNT_KEY,
      scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    });
    youtubeClient = google.youtube({
      version: 'v3',
      auth: await auth.getClient(),
    });
  }
  return youtubeClient;
}

async function fetchVideoBatch(videoIds) {
  try {
    const youtube = await getYouTubeClient();
    const res = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics', 'status'],
      id: videoIds,
    });
    return res.data.items || [];
  } catch (error) {
    console.error(`Error fetching videos:`, error.message);
    return [];
  }
}

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

function processVideoData(video) {
  const {snippet = {}, contentDetails = {}, statistics = {}, status = {}} = video;

  return {
    id: video.id,
    title: snippet.title,
    description: snippet.description,
    channelId: snippet.channelId,
    channelTitle: snippet.channelTitle,
    publishedAt: snippet.publishedAt,
    tags: snippet.tags || [],
    categoryId: snippet.categoryId,
    duration: contentDetails.duration,
    hasCaption: contentDetails.caption === 'true',
    contentRating: contentDetails.contentRating || {},
    regionRestriction: contentDetails.regionRestriction,
    viewCount: parseInt(statistics.viewCount || 0),
    likeCount: parseInt(statistics.likeCount || 0),
    commentCount: parseInt(statistics.commentCount || 0),
    privacyStatus: status.privacyStatus,
    madeForKids: status.madeForKids,
    selfDeclaredMadeForKids: status.selfDeclaredMadeForKids,
    embeddable: status.embeddable,
  };
}

async function analyzeVideos() {
  console.log('📺 YouTube Guardian - Video Analyzer');
  console.log('=====================================\n');

  // Get all unique video IDs from watch history
  const watchedVideos = await db.select({videoId: watchHistory.videoId})
    .from(watchHistory)
    .groupBy(watchHistory.videoId);

  console.log(`Found ${watchedVideos.length} unique videos in watch history\n`);

  // Get already cached video IDs
  const cachedVideoIds = (await db.select({id: videos.id}).from(videos)).map(v => v.id);
  console.log(`Already cached: ${cachedVideoIds.length} videos\n`);

  // Filter to uncached videos
  const uncachedIds = watchedVideos
    .map(v => v.videoId)
    .filter(id => !cachedVideoIds.includes(id));

  if (uncachedIds.length === 0) {
    console.log('✓ All videos already cached!\n');
    return await db.select().from(videos);
  }

  console.log(`Fetching details for ${uncachedIds.length} new videos...`);

  // Process in batches of 50 (API limit)
  const batchSize = 50;
  const newVideos = [];

  for (let i = 0; i < uncachedIds.length; i += batchSize) {
    const batch = uncachedIds.slice(i, i + batchSize);
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uncachedIds.length / batchSize)}...`);

    const fetchedVideos = await fetchVideoBatch(batch);
    const processedVideos = fetchedVideos.map(processVideoData);
    newVideos.push(...processedVideos);

    // Insert into database
    if (processedVideos.length > 0) {
      await db.insert(videos).values(processedVideos);
    }

    // Rate limiting
    if (i + batchSize < uncachedIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n✓ Saved ${newVideos.length} new videos to database\n`);

  // Return all videos
  return await db.select().from(videos);
}

export {analyzeVideos, fetchChannelInfo, getYouTubeClient};
