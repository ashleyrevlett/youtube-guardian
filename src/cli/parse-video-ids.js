import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is two levels up from src/cli/
const PROJECT_ROOT = path.join(__dirname, '..', '..');

/**
 * Parse video IDs from YouTube watch history JSON
 * Filters out ads and non-video entries (like playables/games)
 */
function parseVideoIds(watchHistoryPath) {
  // Read the JSON file
  const data = JSON.parse(fs.readFileSync(watchHistoryPath, 'utf-8'));

  const videoIds = [];
  const stats = {
    total: data.length,
    videos: 0,
    ads: 0,
    playables: 0,
    other: 0
  };

  for (const entry of data) {
    // Skip ads (identified by "From Google Ads" in details)
    if (entry.details && entry.details.some(d => d.name === 'From Google Ads')) {
      stats.ads++;
      continue;
    }

    // Skip playables/games
    if (entry.title.startsWith('Played ') && entry.titleUrl.includes('/playables/')) {
      stats.playables++;
      continue;
    }

    // Extract video ID from URL
    const url = entry.titleUrl;

    // Match standard YouTube watch URLs
    const watchMatch = url.match(/watch\?v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) {
      videoIds.push({
        videoId: watchMatch[1],
        title: entry.title.replace('Watched ', ''),
        channel: entry.subtitles?.[0]?.name || 'Unknown',
        time: entry.time,
        url: url
      });
      stats.videos++;
      continue;
    }

    // If it doesn't match any known pattern
    stats.other++;
  }

  return {videoIds, stats};
}

// Parse the watch history
const watchHistoryPath = path.join(PROJECT_ROOT, 'data', 'watch-history.json');
const {videoIds, stats} = parseVideoIds(watchHistoryPath);

// Display statistics
console.log('=== Watch History Statistics ===');
console.log(`Total entries: ${stats.total}`);
console.log(`Videos found: ${stats.videos}`);
console.log(`Ads filtered: ${stats.ads}`);
console.log(`Playables/games filtered: ${stats.playables}`);
console.log(`Other entries: ${stats.other}`);
console.log('');

// Display first 10 video IDs as examples
console.log('=== First 10 Video IDs ===');
videoIds.slice(0, 10).forEach((video, index) => {
  console.log(`${index + 1}. ${video.videoId} - ${video.title}`);
  console.log(`   Channel: ${video.channel}`);
  console.log(`   Time: ${video.time}`);
  console.log('');
});

// Save video IDs to a separate file
const outputPath = path.join(PROJECT_ROOT, 'data', 'video-ids.json');
fs.writeFileSync(outputPath, JSON.stringify(videoIds, null, 2));
console.log(`Full video list saved to: ${outputPath}`);

// Export for use in other modules
export {parseVideoIds};
