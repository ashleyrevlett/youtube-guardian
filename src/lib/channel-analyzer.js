import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {fetchChannelInfo} from './video-analyzer.js';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function getWatchTimes(watchHistory) {
  const watchTimes = {};
  for (const entry of watchHistory) {
    if (!entry.titleUrl) continue;
    const match = entry.titleUrl.match(/watch\?v=([a-zA-Z0-9_-]+)/);
    if (match) watchTimes[match[1]] = entry.time;
  }
  return watchTimes;
}

function getTopItems(obj, limit) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({[Object.keys(obj)[0] === key ? 'categoryId' : 'tag']: key, count}));
}

function buildChannelProfiles(videoDetails, watchHistory) {
  const profiles = {};
  const watchTimes = getWatchTimes(watchHistory);

  for (const [videoId, video] of Object.entries(videoDetails)) {
    const {channelId, channelTitle, categoryId, tags, viewCount, likeCount, madeForKids, contentRating} = video;

    if (!profiles[channelId]) {
      profiles[channelId] = {
        channelId,
        channelTitle,
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
    profile.totalViews += viewCount;
    profile.totalLikes += likeCount;

    if (categoryId) profile.categories[categoryId] = (profile.categories[categoryId] || 0) + 1;
    tags.forEach(tag => profile.tags[tag] = (profile.tags[tag] || 0) + 1);
    if (madeForKids) profile.madeForKidsCount++;
    if (contentRating && Object.keys(contentRating).length > 0) profile.hasAgeRestriction = true;

    const watchTime = watchTimes[videoId];
    if (watchTime) {
      if (!profile.firstWatched || watchTime < profile.firstWatched) profile.firstWatched = watchTime;
      if (!profile.lastWatched || watchTime > profile.lastWatched) profile.lastWatched = watchTime;
    }

    profile.videos.push({videoId, title: video.title, watchedAt: watchTime});
  }

  // Calculate stats
  for (const profile of Object.values(profiles)) {
    profile.avgViewCount = Math.round(profile.totalViews / profile.videosWatched);
    profile.avgLikeCount = Math.round(profile.totalLikes / profile.videosWatched);
    profile.madeForKidsRatio = profile.madeForKidsCount / profile.videosWatched;
    profile.topCategories = Object.entries(profile.categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([categoryId, count]) => ({categoryId, count}));
    profile.topTags = Object.entries(profile.tags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({tag, count}));
    profile.videos.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt));
  }

  return profiles;
}

async function enrichChannelProfiles(profiles, cachePath) {
  console.log('\n📡 Fetching channel information...');

  const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf-8')) : {};
  let fetched = 0;

  for (const [channelId, profile] of Object.entries(profiles)) {
    if (cache[channelId]) {
      profile.channelInfo = cache[channelId];
      continue;
    }

    console.log(`  Fetching channel: ${profile.channelTitle}...`);
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

      profile.channelInfo = enrichedInfo;
      cache[channelId] = enrichedInfo;
      fetched++;

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (fetched > 0) {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    console.log(`✓ Fetched ${fetched} new channel details\n`);
  }

  return profiles;
}

async function analyzeChannels(videoDetailsPath, watchHistoryPath, outputPath, cachePath) {
  console.log('📊 Channel Profiler');
  console.log('==================\n');

  const videoDetails = JSON.parse(fs.readFileSync(videoDetailsPath, 'utf-8'));
  const watchHistory = JSON.parse(fs.readFileSync(watchHistoryPath, 'utf-8'));

  console.log(`Analyzing ${Object.keys(videoDetails).length} videos from ${watchHistory.length} watch history entries...\n`);

  let profiles = buildChannelProfiles(videoDetails, watchHistory);
  console.log(`Found ${Object.keys(profiles).length} unique channels`);

  profiles = await enrichChannelProfiles(profiles, cachePath);

  const sortedProfiles = Object.values(profiles).sort((a, b) => b.videosWatched - a.videosWatched);

  fs.writeFileSync(outputPath, JSON.stringify(sortedProfiles, null, 2));
  console.log(`✓ Saved channel profiles\n`);

  return sortedProfiles;
}

export {analyzeChannels};
