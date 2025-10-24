import fs from 'fs';
import {CATEGORY_NAMES} from './content-classifier.js';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgGreen: '\x1b[42m'
};

/**
 * Format duration from ISO 8601 to readable format
 */
function formatDuration(duration) {
  if (!duration) return 'Unknown';

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return duration;

  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.join(' ') || '0s';
}

/**
 * Format large numbers with commas
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Print a divider line
 */
function printDivider(char = '=', length = 80) {
  console.log(char.repeat(length));
}

/**
 * Print section header
 */
function printHeader(text) {
  console.log(`\n${colors.bright}${colors.cyan}${text}${colors.reset}`);
  printDivider('=');
}

/**
 * Generate overview summary
 */
function generateOverview(videoDetails, channelProfiles, classification) {
  printHeader('📊 YOUTUBE GUARDIAN - WATCH HISTORY ANALYSIS');

  console.log(`\n${colors.bright}Total Videos Analyzed:${colors.reset} ${Object.keys(videoDetails).length}`);
  console.log(`${colors.bright}Unique Channels:${colors.reset} ${channelProfiles.length}`);

  console.log(`\n${colors.bright}Risk Assessment:${colors.reset}`);
  console.log(`  ${colors.bgRed}${colors.white} HIGH   ${colors.reset} ${colors.red}${classification.summary.highRisk} videos${colors.reset}`);
  console.log(`  ${colors.bgYellow}${colors.white} MEDIUM ${colors.reset} ${colors.yellow}${classification.summary.mediumRisk} videos${colors.reset}`);
  console.log(`  ${colors.bgGreen}${colors.white} LOW    ${colors.reset} ${colors.green}${classification.summary.lowRisk} videos${colors.reset}`);
}

/**
 * Generate concerning content report
 */
function generateConcerningContent(classification, videoDetails) {
  const concerning = classification.results
    .filter(r => r.riskLevel === 'HIGH' || r.riskLevel === 'MEDIUM')
    .sort((a, b) => {
      if (a.riskLevel === 'HIGH' && b.riskLevel !== 'HIGH') return -1;
      if (a.riskLevel !== 'HIGH' && b.riskLevel === 'HIGH') return 1;
      return b.flagCount - a.flagCount;
    });

  if (concerning.length === 0) {
    printHeader('✅ NO CONCERNING CONTENT FOUND');
    console.log('\nAll videos passed content screening!');
    return;
  }

  printHeader('⚠️  CONCERNING CONTENT DETECTED');

  console.log(`\nFound ${concerning.length} videos that require attention:\n`);

  for (let i = 0; i < concerning.length; i++) {
    const result = concerning[i];
    const video = videoDetails[result.videoId];

    // Risk level badge
    const badge = result.riskLevel === 'HIGH'
      ? `${colors.bgRed}${colors.white} HIGH ${colors.reset}`
      : `${colors.bgYellow}${colors.white} MED ${colors.reset}`;

    console.log(`${i + 1}. ${badge} ${colors.bright}${result.title}${colors.reset}`);
    console.log(`   Channel: ${colors.cyan}${result.channelTitle}${colors.reset}`);
    console.log(`   Category: ${result.categoryName}`);
    console.log(`   Video ID: ${result.videoId}`);

    if (video) {
      console.log(`   Duration: ${formatDuration(video.duration)} | Views: ${formatNumber(video.viewCount)}`);
    }

    // Print flags
    if (result.flags.length > 0) {
      console.log(`\n   ${colors.red}${colors.bright}FLAGS:${colors.reset}`);
      for (const flag of result.flags) {
        console.log(`   ${colors.red}▸${colors.reset} ${flag.message}`);
      }
    }

    // Print warnings
    if (result.warnings.length > 0) {
      console.log(`\n   ${colors.yellow}${colors.bright}WARNINGS:${colors.reset}`);
      for (const warning of result.warnings) {
        console.log(`   ${colors.yellow}▸${colors.reset} ${warning.message}`);
      }
    }

    console.log();
  }
}

/**
 * Generate channel statistics
 */
function generateChannelStats(channelProfiles) {
  printHeader('📺 TOP CHANNELS');

  const top10 = channelProfiles.slice(0, 10);

  console.log(`\nTop 10 most watched channels:\n`);

  for (let i = 0; i < top10.length; i++) {
    const channel = top10[i];
    console.log(`${i + 1}. ${colors.bright}${channel.channelTitle}${colors.reset}`);
    console.log(`   Videos Watched: ${channel.videosWatched}`);
    console.log(`   Avg Views: ${formatNumber(channel.avgViewCount)}`);

    if (channel.channelInfo) {
      console.log(`   Subscribers: ${formatNumber(channel.channelInfo.subscriberCount)}`);
    }

    if (channel.topCategories.length > 0) {
      const catNames = channel.topCategories
        .map(c => CATEGORY_NAMES[c.categoryId] || c.categoryId)
        .join(', ');
      console.log(`   Categories: ${catNames}`);
    }

    if (channel.hasAgeRestriction) {
      console.log(`   ${colors.yellow}⚠️  Has posted age-restricted content${colors.reset}`);
    }

    console.log();
  }
}

/**
 * Generate category breakdown
 */
function generateCategoryBreakdown(videoDetails) {
  printHeader('📊 CONTENT CATEGORIES');

  const categoryCounts = {};
  for (const video of Object.values(videoDetails)) {
    const catId = video.categoryId || 'Unknown';
    categoryCounts[catId] = (categoryCounts[catId] || 0) + 1;
  }

  const sorted = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1]);

  console.log('\nVideo count by category:\n');

  for (const [catId, count] of sorted) {
    const catName = CATEGORY_NAMES[catId] || 'Unknown';
    const percentage = ((count / Object.keys(videoDetails).length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(percentage / 2));

    console.log(`${catName.padEnd(25)} ${colors.cyan}${bar}${colors.reset} ${count} (${percentage}%)`);
  }
}

/**
 * Generate recommendations
 */
function generateRecommendations(classification) {
  printHeader('💡 RECOMMENDATIONS');

  const highRisk = classification.summary.highRisk;
  const mediumRisk = classification.summary.mediumRisk;

  console.log();

  if (highRisk > 0) {
    console.log(`${colors.red}▸${colors.reset} ${highRisk} high-risk videos detected - Review immediately`);
    console.log(`  Consider adding flagged channels or keywords to blocklist`);
  }

  if (mediumRisk > 0) {
    console.log(`${colors.yellow}▸${colors.reset} ${mediumRisk} medium-risk videos detected - Review when possible`);
  }

  if (highRisk === 0 && mediumRisk === 0) {
    console.log(`${colors.green}▸${colors.reset} No concerning content detected - Continue monitoring`);
  }

  console.log(`\n${colors.dim}To customize screening, edit: config/blocklist.json${colors.reset}`);
  console.log(`${colors.dim}Add keywords, channel IDs, or category IDs to flag content${colors.reset}\n`);
}

/**
 * Generate complete terminal report
 */
function generateReport(videoDetails, channelProfiles, classification, outputPath = null) {
  generateOverview(videoDetails, channelProfiles, classification);
  generateConcerningContent(classification, videoDetails);
  generateChannelStats(channelProfiles);
  generateCategoryBreakdown(videoDetails);
  generateRecommendations(classification);

  printDivider('=');
  console.log();

  // Save to JSON file if requested
  if (outputPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      summary: classification.summary,
      concerningVideos: classification.results.filter(r => r.riskLevel !== 'LOW'),
      topChannels: channelProfiles.slice(0, 10),
      allResults: classification.results
    };

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`${colors.green}✓${colors.reset} Full report saved to: ${outputPath}\n`);
  }
}

export {generateReport};
