import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {db, watchHistory} from '../db/index.js';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseVideoIds(watchHistoryPath) {
  const data = JSON.parse(fs.readFileSync(watchHistoryPath, 'utf-8'));
  const videoIds = [];
  const stats = {total: data.length, videos: 0, ads: 0, playables: 0, other: 0};

  for (const entry of data) {
    // Skip ads
    if (entry.details?.some(d => d.name === 'From Google Ads')) {
      stats.ads++;
      continue;
    }

    // Skip playables/games
    if (entry.title?.startsWith('Played ') && entry.titleUrl?.includes('/playables/')) {
      stats.playables++;
      continue;
    }

    // Extract video ID from watch URL
    const match = entry.titleUrl?.match(/watch\?v=([a-zA-Z0-9_-]+)/);
    if (match) {
      videoIds.push({
        videoId: match[1],
        watchedAt: entry.time,
        title: entry.title.replace('Watched ', ''),
        channel: entry.subtitles?.[0]?.name || 'Unknown',
      });
      stats.videos++;
    } else {
      stats.other++;
    }
  }

  return {videoIds, stats};
}

// Main execution
const watchHistoryPath = path.join(PROJECT_ROOT, 'data', 'watch-history.json');
const {videoIds, stats} = parseVideoIds(watchHistoryPath);

console.log('=== Watch History Statistics ===');
console.log(`Total: ${stats.total} | Videos: ${stats.videos} | Ads: ${stats.ads} | Games: ${stats.playables} | Other: ${stats.other}\n`);

// Clear existing watch history
await db.delete(watchHistory);

// Insert all watch history entries into database
await db.insert(watchHistory).values(videoIds);

console.log(`✓ Inserted ${videoIds.length} videos into database\n`);

console.log('=== First 10 Videos ===');
videoIds.slice(0, 10).forEach((v, i) => {
  console.log(`${i + 1}. ${v.videoId} - ${v.title}`);
  console.log(`   ${v.channel} | ${v.watchedAt}\n`);
});
