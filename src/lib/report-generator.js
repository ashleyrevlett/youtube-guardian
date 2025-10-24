import fs from 'fs';
import {CATEGORY_NAMES} from './content-classifier.js';

const c = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  bgRed: '\x1b[41m', bgYellow: '\x1b[43m', bgGreen: '\x1b[42m', white: '\x1b[37m'
};

function formatDuration(duration) {
  if (!duration) return 'Unknown';
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return duration;

  const [, h, m, s] = match;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

const formatNumber = num => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const divider = () => console.log('='.repeat(80));
const header = text => console.log(`\n${c.bright}${c.cyan}${text}${c.reset}\n${'='.repeat(80)}`);

function generateOverview(videoDetails, channelProfiles, classification) {
  header('📊 YOUTUBE GUARDIAN - WATCH HISTORY ANALYSIS');
  console.log(`\n${c.bright}Total Videos:${c.reset} ${Object.keys(videoDetails).length}`);
  console.log(`${c.bright}Unique Channels:${c.reset} ${channelProfiles.length}`);
  console.log(`\n${c.bright}Risk Assessment:${c.reset}`);
  console.log(`  ${c.bgRed}${c.white} HIGH   ${c.reset} ${c.red}${classification.summary.highRisk} videos${c.reset}`);
  console.log(`  ${c.bgYellow}${c.white} MEDIUM ${c.reset} ${c.yellow}${classification.summary.mediumRisk} videos${c.reset}`);
  console.log(`  ${c.bgGreen}${c.white} LOW    ${c.reset} ${c.green}${classification.summary.lowRisk} videos${c.reset}`);
}

function generateConcerningContent(classification, videoDetails) {
  const concerning = classification.results
    .filter(r => r.riskLevel !== 'LOW')
    .sort((a, b) => a.riskLevel === 'HIGH' && b.riskLevel !== 'HIGH' ? -1 : b.flagCount - a.flagCount);

  if (concerning.length === 0) {
    header('✅ NO CONCERNING CONTENT FOUND');
    console.log('\nAll videos passed content screening!');
    return;
  }

  header('⚠️  CONCERNING CONTENT DETECTED');
  console.log(`\nFound ${concerning.length} videos requiring attention:\n`);

  concerning.forEach((result, i) => {
    const video = videoDetails[result.videoId];
    const badge = result.riskLevel === 'HIGH'
      ? `${c.bgRed}${c.white} HIGH ${c.reset}`
      : `${c.bgYellow}${c.white} MED ${c.reset}`;

    console.log(`${i + 1}. ${badge} ${c.bright}${result.title}${c.reset}`);
    console.log(`   Channel: ${c.cyan}${result.channelTitle}${c.reset} | Category: ${result.categoryName}`);
    console.log(`   Video ID: ${result.videoId}`);
    if (video) {
      console.log(`   Duration: ${formatDuration(video.duration)} | Views: ${formatNumber(video.viewCount)}`);
    }

    if (result.flags.length) {
      console.log(`\n   ${c.red}${c.bright}FLAGS:${c.reset}`);
      result.flags.forEach(flag => console.log(`   ${c.red}▸${c.reset} ${flag.message}`));
    }

    if (result.warnings.length) {
      console.log(`\n   ${c.yellow}${c.bright}WARNINGS:${c.reset}`);
      result.warnings.forEach(warning => console.log(`   ${c.yellow}▸${c.reset} ${warning.message}`));
    }
    console.log();
  });
}

function generateChannelStats(channelProfiles) {
  header('📺 TOP CHANNELS');
  console.log('\nTop 10 most watched channels:\n');

  channelProfiles.slice(0, 10).forEach((channel, i) => {
    console.log(`${i + 1}. ${c.bright}${channel.channelTitle}${c.reset}`);
    console.log(`   Videos: ${channel.videosWatched} | Avg Views: ${formatNumber(channel.avgViewCount)}`);
    if (channel.channelInfo) {
      console.log(`   Subscribers: ${formatNumber(channel.channelInfo.subscriberCount)}`);
    }
    if (channel.topCategories.length) {
      const cats = channel.topCategories.map(c => CATEGORY_NAMES[c.categoryId] || c.categoryId).join(', ');
      console.log(`   Categories: ${cats}`);
    }
    if (channel.hasAgeRestriction) {
      console.log(`   ${c.yellow}⚠️  Has age-restricted content${c.reset}`);
    }
    console.log();
  });
}

function generateCategoryBreakdown(videoDetails) {
  header('📊 CONTENT CATEGORIES');

  const counts = {};
  Object.values(videoDetails).forEach(v => {
    const cat = v.categoryId || 'Unknown';
    counts[cat] = (counts[cat] || 0) + 1;
  });

  const total = Object.keys(videoDetails).length;
  console.log('\nVideo count by category:\n');

  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([catId, count]) => {
      const catName = CATEGORY_NAMES[catId] || 'Unknown';
      const pct = ((count / total) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(pct / 2));
      console.log(`${catName.padEnd(25)} ${c.cyan}${bar}${c.reset} ${count} (${pct}%)`);
    });
}

function generateRecommendations(classification) {
  header('💡 RECOMMENDATIONS');

  const {highRisk, mediumRisk} = classification.summary;

  if (highRisk > 0) {
    console.log(`${c.red}▸${c.reset} ${highRisk} high-risk videos - Review immediately`);
    console.log(`  Consider adding flagged channels/keywords to blocklist`);
  }

  if (mediumRisk > 0) {
    console.log(`${c.yellow}▸${c.reset} ${mediumRisk} medium-risk videos - Review when possible`);
  }

  if (highRisk === 0 && mediumRisk === 0) {
    console.log(`${c.green}▸${c.reset} No concerning content detected`);
  }

  console.log(`\n${c.dim}Customize screening: config/blocklist.json${c.reset}\n`);
}

function generateReport(videoDetails, channelProfiles, classification, outputPath = null) {
  generateOverview(videoDetails, channelProfiles, classification);
  generateConcerningContent(classification, videoDetails);
  generateChannelStats(channelProfiles);
  generateCategoryBreakdown(videoDetails);
  generateRecommendations(classification);

  divider();
  console.log();

  if (outputPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      summary: classification.summary,
      concerningVideos: classification.results.filter(r => r.riskLevel !== 'LOW'),
      topChannels: channelProfiles.slice(0, 10),
      allResults: classification.results
    };
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`${c.green}✓${c.reset} Report saved: ${outputPath}\n`);
  }
}

export {generateReport};
