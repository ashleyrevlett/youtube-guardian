// Shared report generation utilities
import {db, videos, tags, videoTags, aiAnalysis, watchHistory} from '../db/index.js';

// ANSI color codes
const COLORS = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  reset: '\x1b[0m'
};

function colorize(text, color) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function getRiskColor(riskLevel) {
  if (riskLevel === 'HIGH') return 'red';
  if (riskLevel === 'MEDIUM') return 'yellow';
  return 'green';
}

/**
 * Parse ISO 8601 duration (e.g., PT10M30S) to seconds
 * @param {string} duration - ISO 8601 duration string
 * @returns {number} Duration in seconds
 */
function parseDuration(duration) {
  if (!duration) return 0;

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format seconds to human-readable watch time (e.g., "2h 45m" or "35m")
 * @param {number} seconds - Total seconds
 * @returns {string} Formatted time string
 */
function formatWatchTime(seconds) {
  if (!seconds || seconds === 0) return '0m';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Generate tag cloud showing watch time distribution
 * @returns {Promise<void>}
 */
async function generateTagCloud() {
  console.log(colorize('Tag Cloud (by watch time):', 'bold'));
  console.log('─'.repeat(80));
  console.log();

  // Get all tags with their associated videos
  const allTags = await db.select().from(tags);
  const allVideoTags = await db.select().from(videoTags);
  const allVideos = await db.select().from(videos);
  const allWatchHistory = await db.select().from(watchHistory);

  // Build maps
  const videoMap = {};
  allVideos.forEach(v => {
    videoMap[v.id] = v;
  });

  // Count watch frequency per video
  const watchCounts = {};
  allWatchHistory.forEach(wh => {
    watchCounts[wh.videoId] = (watchCounts[wh.videoId] || 0) + 1;
  });

  // Calculate watch time per tag
  const tagWatchTime = {};

  allTags.forEach(tag => {
    // Find all videos with this tag
    const videosWithTag = allVideoTags
      .filter(vt => vt.tagId === tag.id)
      .map(vt => vt.videoId);

    let totalSeconds = 0;

    videosWithTag.forEach(videoId => {
      const video = videoMap[videoId];
      if (!video || !video.duration) return;

      const durationSeconds = parseDuration(video.duration);
      const timesWatched = watchCounts[videoId] || 0;

      totalSeconds += durationSeconds * timesWatched;
    });

    if (totalSeconds > 0) {
      tagWatchTime[tag.name] = totalSeconds;
    }
  });

  // Sort tags by watch time
  const sortedTags = Object.entries(tagWatchTime)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15); // Top 15 tags

  if (sortedTags.length === 0) {
    console.log(colorize('  No tag data available\n', 'gray'));
    return;
  }

  // Find max watch time for normalization
  const maxSeconds = sortedTags[0][1];
  const maxBarWidth = 40;

  // Display each tag with horizontal bar
  sortedTags.forEach(([tagName, seconds]) => {
    const percentage = seconds / maxSeconds;
    const barWidth = Math.max(1, Math.floor(percentage * maxBarWidth));
    const bar = '█'.repeat(barWidth);
    const timeStr = formatWatchTime(seconds);

    // Pad tag name to align bars
    const paddedTag = tagName.padEnd(20);

    console.log(`${paddedTag} ${colorize(bar, 'blue')}  ${colorize(timeStr, 'gray')}`);
  });

  console.log();
}

/**
 * Generate and display full AI analysis report
 * @returns {Promise<void>}
 */
async function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log(colorize('\n🤖 AI Content Analysis Report', 'bold'));
  console.log('='.repeat(80) + '\n');

  // Get all videos with AI analysis
  const allVideos = await db.select().from(videos);
  const allAnalysis = await db.select().from(aiAnalysis);

  if (allAnalysis.length === 0) {
    console.log(colorize('❌ No AI analysis found', 'red'));
    console.log('Videos need to be analyzed first\n');
    return;
  }

  // Build map of videoId -> analysis
  const analysisMap = {};
  allAnalysis.forEach(a => {
    analysisMap[a.videoId] = a;
  });

  // Get tags for each video
  const videoTagsData = await db.select().from(videoTags);
  const allTags = await db.select().from(tags);

  // Build maps
  const tagMap = {};
  allTags.forEach(t => {
    tagMap[t.id] = t.name;
  });

  const videoTagsMap = {};
  videoTagsData.forEach(vt => {
    if (!videoTagsMap[vt.videoId]) {
      videoTagsMap[vt.videoId] = [];
    }
    videoTagsMap[vt.videoId].push(tagMap[vt.tagId]);
  });

  // Filter to videos with analysis and sort by risk level
  const analyzedVideos = allVideos
    .filter(v => analysisMap[v.id])
    .sort((a, b) => {
      const riskOrder = {HIGH: 0, MEDIUM: 1, LOW: 2};
      const aRisk = analysisMap[a.id].riskLevel || 'LOW';
      const bRisk = analysisMap[b.id].riskLevel || 'LOW';
      return riskOrder[aRisk] - riskOrder[bRisk];
    });

  // Summary stats
  const riskCounts = {HIGH: 0, MEDIUM: 0, LOW: 0};
  analyzedVideos.forEach(v => {
    const risk = analysisMap[v.id].riskLevel || 'LOW';
    riskCounts[risk]++;
  });

  console.log(colorize('Summary:', 'bold'));
  console.log(`  Total analyzed: ${analyzedVideos.length} videos`);
  console.log(`  ${colorize('HIGH', 'red')} risk: ${riskCounts.HIGH}`);
  console.log(`  ${colorize('MEDIUM', 'yellow')} risk: ${riskCounts.MEDIUM}`);
  console.log(`  ${colorize('LOW', 'green')} risk: ${riskCounts.LOW}`);
  console.log();

  // Flagged content section
  const flaggedVideos = analyzedVideos.filter(v => {
    const flags = analysisMap[v.id].contentFlags || [];
    return flags.length > 0;
  });

  console.log(colorize('Flagged Content:', 'bold'));
  console.log('─'.repeat(80));
  console.log();

  if (flaggedVideos.length === 0) {
    console.log(colorize('  ✓ No objectionable content detected', 'green'));
    console.log();
  } else {
    // Group by severity
    const severe = flaggedVideos.filter(v => analysisMap[v.id].flaggedSeverity === 'SEVERE');
    const moderate = flaggedVideos.filter(v => analysisMap[v.id].flaggedSeverity === 'MODERATE');

    if (severe.length > 0) {
      console.log(colorize(`SEVERE (${severe.length} videos):`, 'red'));
      severe.forEach(video => {
        const analysis = analysisMap[video.id];
        const flags = analysis.contentFlags || [];
        console.log(`  • ${video.title}`);
        console.log(`    ${colorize('Flags:', 'gray')} ${colorize(flags.join(', '), 'red')}`);
        if (analysis.reasoning) {
          console.log(`    ${colorize('→', 'gray')} ${analysis.reasoning}`);
        }
        console.log();
      });
    }

    if (moderate.length > 0) {
      console.log(colorize(`MODERATE (${moderate.length} videos):`, 'yellow'));
      moderate.forEach(video => {
        const analysis = analysisMap[video.id];
        const flags = analysis.contentFlags || [];
        console.log(`  • ${video.title}`);
        console.log(`    ${colorize('Flags:', 'gray')} ${colorize(flags.join(', '), 'yellow')}`);
        if (analysis.reasoning) {
          console.log(`    ${colorize('→', 'gray')} ${analysis.reasoning}`);
        }
        console.log();
      });
    }

    console.log();
  }

  // Tag cloud
  await generateTagCloud();

  // Table header
  console.log(colorize('RANK  RISK    VIDEO', 'bold'));
  console.log('─'.repeat(80));
  console.log();

  // Display each video
  analyzedVideos.forEach((video, idx) => {
    const analysis = analysisMap[video.id];
    const videoTagsList = videoTagsMap[video.id] || [];
    const riskLevel = analysis.riskLevel || 'LOW';
    const riskColor = getRiskColor(riskLevel);

    // Row 1: Rank, Risk, Title
    const rank = String(idx + 1).padEnd(6);
    const risk = colorize(riskLevel.padEnd(8), riskColor);
    console.log(`${rank}${risk}${colorize(video.title, 'bold')}`);

    // Row 2: Summary (if available)
    if (analysis.summary) {
      console.log(`${' '.repeat(14)}${colorize(analysis.summary, 'gray')}`);
    }

    // Row 3: Tags (indented under title)
    const tagDisplay = videoTagsList.length > 0
      ? colorize(videoTagsList.join(', '), 'blue')
      : colorize('(no tags)', 'gray');
    console.log(`${' '.repeat(14)}${tagDisplay}`);

    // Row 4: Reasoning (only for HIGH/MEDIUM)
    if (analysis.reasoning && (riskLevel === 'HIGH' || riskLevel === 'MEDIUM')) {
      console.log(`${' '.repeat(14)}${colorize('→ ', 'gray')}${analysis.reasoning}`);
    }

    console.log();
  });

  console.log('='.repeat(80));
  console.log(colorize('\n✅ Report complete\n', 'green'));
}

export {generateReport, generateTagCloud, colorize, parseDuration, formatWatchTime, getRiskColor};
