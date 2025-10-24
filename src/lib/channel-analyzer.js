import {db, videos, channels, watchHistory} from '../db/index.js';
import {fetchChannelInfo} from './video-analyzer.js';
import {sql, count, avg, min, max, desc} from 'drizzle-orm';

async function analyzeChannels() {
  console.log('📊 Channel Profiler');
  console.log('==================\n');

  // Build channel statistics from database using SQL aggregation
  const channelStats = await db
    .select({
      channelId: videos.channelId,
      channelTitle: videos.channelTitle,
      videosWatched: count(),
      avgViewCount: avg(videos.viewCount),
      avgLikeCount: avg(videos.likeCount),
      totalViews: sql`SUM(${videos.viewCount})`,
      totalLikes: sql`SUM(${videos.likeCount})`,
      madeForKidsCount: sql`SUM(CASE WHEN ${videos.madeForKids} = 1 THEN 1 ELSE 0 END)`,
      hasAgeRestriction: sql`MAX(CASE WHEN json_array_length(${videos.contentRating}) > 2 THEN 1 ELSE 0 END)`,
    })
    .from(videos)
    .groupBy(videos.channelId, videos.channelTitle);

  console.log(`Found ${channelStats.length} unique channels\n`);

  // Enrich with watch times
  for (const stat of channelStats) {
    // Get watch times for this channel's videos
    const watches = await db
      .select({
        watchedAt: watchHistory.watchedAt,
        videoId: watchHistory.videoId,
        title: watchHistory.title
      })
      .from(watchHistory)
      .innerJoin(videos, sql`${watchHistory.videoId} = ${videos.id}`)
      .where(sql`${videos.channelId} = ${stat.channelId}`)
      .orderBy(desc(watchHistory.watchedAt));

    stat.firstWatched = watches[watches.length - 1]?.watchedAt;
    stat.lastWatched = watches[0]?.watchedAt;
    stat.videos = watches;
    stat.madeForKidsRatio = stat.madeForKidsCount / stat.videosWatched;
  }

  // Get cached channels
  const cachedChannels = (await db.select({id: channels.id}).from(channels)).map(c => c.id);
  const uncachedChannels = channelStats.filter(s => !cachedChannels.includes(s.channelId));

  if (uncachedChannels.length > 0) {
    console.log('📡 Fetching channel information...');

    for (const stat of uncachedChannels) {
      console.log(`  Fetching: ${stat.channelTitle}...`);
      const channelInfo = await fetchChannelInfo(stat.channelId);

      if (channelInfo) {
        await db.insert(channels).values({
          id: stat.channelId,
          title: channelInfo.snippet?.title || stat.channelTitle,
          description: channelInfo.snippet?.description || '',
          subscriberCount: parseInt(channelInfo.statistics?.subscriberCount || 0),
          videoCount: parseInt(channelInfo.statistics?.videoCount || 0),
          viewCount: parseInt(channelInfo.statistics?.viewCount || 0),
          publishedAt: channelInfo.snippet?.publishedAt,
          thumbnails: channelInfo.snippet?.thumbnails,
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✓ Fetched ${uncachedChannels.length} new channels\n`);
  }

  // Get all channel info
  const allChannels = await db.select().from(channels);
  const channelLookup = Object.fromEntries(allChannels.map(c => [c.id, c]));

  // Merge stats with channel info
  const profiles = channelStats.map(stat => ({
    ...stat,
    channelInfo: channelLookup[stat.channelId],
  })).sort((a, b) => b.videosWatched - a.videosWatched);

  console.log('✓ Channel analysis complete\n');

  return profiles;
}

export {analyzeChannels};
