import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {fetchChannelInfo} from './video-analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Build channel profiles from video data
 * @param {Object} videoDetails - Video details keyed by video ID
 * @param {Array} watchHistory - Original watch history with timestamps
 * @returns {Object} Channel profiles with statistics
 */
function buildChannelProfiles(videoDetails, watchHistory) {
  const profiles = {};

  // Create a map of video IDs to watch times
  const watchTimes = {};
  for (const entry of watchHistory) {
    // Skip entries without titleUrl
    if (!entry.titleUrl) continue;

    const videoIdMatch = entry.titleUrl.match(/watch\?v=([a-zA-Z0-9_-]+)/);
    if (videoIdMatch) {
      watchTimes[videoIdMatch[1]] = entry.time;
    }
  }

  // Analyze each video
  for (const [videoId, video] of Object.entries(videoDetails)) {
    const channelId = video.channelId;

    if (!profiles[channelId]) {
      profiles[channelId] = {
        channelId: channelId,
        channelTitle: video.channelTitle,
        videosWatched: 0,
        totalViews: 0,
        totalLikes: 0,
        categories: {},
        tags: {},
        madeForKidsCount: 0,
        hasAgeRestriction: false,
        firstWatched: null,
        lastWatched: null,
        videos: []
      };
    }

    const profile = profiles[channelId];
    profile.videosWatched++;
    profile.totalViews += video.viewCount;
    profile.totalLikes += video.likeCount;

    // Track categories
    if (video.categoryId) {
      profile.categories[video.categoryId] = (profile.categories[video.categoryId] || 0) + 1;
    }

    // Track tags
    for (const tag of video.tags) {
      profile.tags[tag] = (profile.tags[tag] || 0) + 1;
    }

    // Track made for kids
    if (video.madeForKids) {
      profile.madeForKidsCount++;
    }

    // Check for age restrictions
    if (video.contentRating && Object.keys(video.contentRating).length > 0) {
      profile.hasAgeRestriction = true;
    }

    // Track watch times
    const watchTime = watchTimes[videoId];
    if (watchTime) {
      if (!profile.firstWatched || watchTime < profile.firstWatched) {
        profile.firstWatched = watchTime;
      }
      if (!profile.lastWatched || watchTime > profile.lastWatched) {
        profile.lastWatched = watchTime;
      }
    }

    // Store video reference
    profile.videos.push({
      videoId: videoId,
      title: video.title,
      watchedAt: watchTime
    });
  }

  // Calculate statistics for each profile
  for (const profile of Object.values(profiles)) {
    profile.avgViewCount = Math.round(profile.totalViews / profile.videosWatched);
    profile.avgLikeCount = Math.round(profile.totalLikes / profile.videosWatched);
    profile.madeForKidsRatio = profile.madeForKidsCount / profile.videosWatched;

    // Get top categories
    profile.topCategories = Object.entries(profile.categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, count]) => ({categoryId: cat, count}));

    // Get top tags
    profile.topTags = Object.entries(profile.tags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({tag, count}));

    // Sort videos by watch time
    profile.videos.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt));
  }

  return profiles;
}

/**
 * Fetch additional channel information from YouTube API
 * @param {Object} profiles - Channel profiles
 * @param {string} cachePath - Path to channel cache
 */
async function enrichChannelProfiles(profiles, cachePath) {
  console.log('\n📡 Fetching channel information...');

  // Load cache if it exists
  let cache = {};
  if (fs.existsSync(cachePath)) {
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  }

  const channelIds = Object.keys(profiles);
  let fetched = 0;

  for (const channelId of channelIds) {
    // Check cache first
    if (cache[channelId]) {
      profiles[channelId].channelInfo = cache[channelId];
      continue;
    }

    console.log(`  Fetching channel: ${profiles[channelId].channelTitle}...`);
    const channelInfo = await fetchChannelInfo(channelId);

    if (channelInfo) {
      const enrichedInfo = {
        subscriberCount: parseInt(channelInfo.statistics?.subscriberCount || 0),
        videoCount: parseInt(channelInfo.statistics?.videoCount || 0),
        viewCount: parseInt(channelInfo.statistics?.viewCount || 0),
        description: channelInfo.snippet?.description || '',
        publishedAt: channelInfo.snippet?.publishedAt,
        thumbnails: channelInfo.snippet?.thumbnails,
        fetchedAt: new Date().toISOString()
      };

      profiles[channelId].channelInfo = enrichedInfo;
      cache[channelId] = enrichedInfo;
      fetched++;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Save cache
  if (fetched > 0) {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    console.log(`✓ Fetched ${fetched} new channel details\n`);
  }

  return profiles;
}

/**
 * Analyze channels from video data
 */
async function analyzeChannels(videoDetailsPath, watchHistoryPath, outputPath, cachePath) {
  console.log('📊 Channel Profiler');
  console.log('==================\n');

  // Load video details
  const videoDetails = JSON.parse(fs.readFileSync(videoDetailsPath, 'utf-8'));

  // Load watch history
  const watchHistory = JSON.parse(fs.readFileSync(watchHistoryPath, 'utf-8'));

  console.log(`Analyzing ${Object.keys(videoDetails).length} videos from ${Object.keys(watchHistory).length} watch history entries...\n`);

  // Build channel profiles
  let profiles = buildChannelProfiles(videoDetails, watchHistory);

  console.log(`Found ${Object.keys(profiles).length} unique channels`);

  // Enrich with API data
  profiles = await enrichChannelProfiles(profiles, cachePath);

  // Sort by videos watched
  const sortedProfiles = Object.values(profiles)
    .sort((a, b) => b.videosWatched - a.videosWatched);

  // Save to file
  fs.writeFileSync(outputPath, JSON.stringify(sortedProfiles, null, 2));
  console.log(`✓ Saved channel profiles to ${outputPath}\n`);

  return sortedProfiles;
}

export {analyzeChannels, buildChannelProfiles, enrichChannelProfiles};
