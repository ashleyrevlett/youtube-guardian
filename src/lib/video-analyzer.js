import 'dotenv/config';
import {google} from 'googleapis';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

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
    embeddable: status.embeddable,
    fetchedAt: new Date().toISOString()
  };
}

async function analyzeVideos(videoIdsPath, outputPath) {
  console.log('📺 YouTube Guardian - Video Analyzer');
  console.log('=====================================\n');

  const videoData = JSON.parse(fs.readFileSync(videoIdsPath, 'utf-8'));
  const videoIds = videoData.map(v => v.videoId);
  console.log(`Found ${videoIds.length} videos to analyze\n`);

  // Load cache
  const cache = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
    : {};

  if (Object.keys(cache).length > 0) {
    console.log(`Loaded ${Object.keys(cache).length} cached videos\n`);
  }

  const uncachedIds = videoIds.filter(id => !cache[id]);

  if (uncachedIds.length === 0) {
    console.log('✓ All videos already cached!\n');
    return cache;
  }

  console.log(`Fetching details for ${uncachedIds.length} new videos...`);

  // Process in batches of 50 (API limit)
  const batchSize = 50;
  for (let i = 0; i < uncachedIds.length; i += batchSize) {
    const batch = uncachedIds.slice(i, i + batchSize);
    console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uncachedIds.length / batchSize)}...`);

    const videos = await fetchVideoBatch(batch);
    videos.forEach(video => {
      cache[video.id] = processVideoData(video);
    });

    // Rate limiting: wait 1 second between batches
    if (i + batchSize < uncachedIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(cache, null, 2));
  console.log(`\n✓ Saved ${Object.keys(cache).length} video details\n`);

  return cache;
}

export {analyzeVideos, fetchChannelInfo, getYouTubeClient};
