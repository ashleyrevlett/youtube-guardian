import fs from 'fs';
import {CATEGORY_NAMES} from './content-classifier.js';
import {db, videos, classifications, classificationFlags} from '../db/index.js';
import {sql, eq} from 'drizzle-orm';

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

function generateOverview(videoCount, channelCount, summary) {
  header('📊 YOUTUBE GUARDIAN - WATCH HISTORY ANALYSIS');
  console.log(`\n${c.bright}Total Videos:${c.reset} ${videoCount}`);
  console.log(`${c.bright}Unique Channels:${c.reset} ${channelCount}`);
  console.log(`\n${c.bright}Risk Assessment:${c.reset}`);
  console.log(`  ${c.bgRed}${c.white} HIGH   ${c.reset} ${c.red}${summary.highRisk} videos${c.reset}`);
  console.log(`  ${c.bgYellow}${c.white} MEDIUM ${c.reset} ${c.yellow}${summary.mediumRisk} videos${c.reset}`);
  console.log(`  ${c.bgGreen}${c.white} LOW    ${c.reset} ${c.green}${summary.lowRisk} videos${c.reset}`);
}

async function generateConcerningContent() {
  // Query database for concerning videos
  const concerningResults = await db
    .select({
      videoId: classifications.videoId,
      riskLevel: classifications.riskLevel,
      flagCount: classifications.flagCount,
      warningCount: classifications.warningCount,
      title: videos.title,
      channelTitle: videos.channelTitle,
      categoryId: videos.categoryId,
      duration: videos.duration,
      viewCount: videos.viewCount,
    })
    .from(classifications)
    .innerJoin(videos, eq(classifications.videoId, videos.id))
    .where(sql`${classifications.riskLevel} IN ('HIGH', 'MEDIUM')`)
    .orderBy(sql`CASE WHEN ${classifications.riskLevel} = 'HIGH' THEN 0 ELSE 1 END, ${classifications.flagCount} DESC`);

  if (concerningResults.length === 0) {
    header('✅ NO CONCERNING CONTENT FOUND');
    console.log('\nAll videos passed content screening!');
    return [];
  }

  header('⚠️  CONCERNING CONTENT DETECTED');
  console.log(`\nFound ${concerningResults.length} videos requiring attention:\n`);

  for (let i = 0; i < concerningResults.length; i++) {
    const result = concerningResults[i];
    const badge = result.riskLevel === 'HIGH'
      ? `${c.bgRed}${c.white} HIGH ${c.reset}`
      : `${c.bgYellow}${c.white} MED ${c.reset}`;

    console.log(`${i + 1}. ${badge} ${c.bright}${result.title}${c.reset}`);
    console.log(`   Channel: ${c.cyan}${result.channelTitle}${c.reset} | Category: ${CATEGORY_NAMES[result.categoryId] || 'Unknown'}`);
    console.log(`   Video ID: ${result.videoId}`);
    console.log(`   Duration: ${formatDuration(result.duration)} | Views: ${formatNumber(result.viewCount)}`);

    // Fetch and display classification flags for this video
    const flags = await db
      .select()
      .from(classificationFlags)
      .where(eq(classificationFlags.videoId, result.videoId));

    if (flags.length > 0) {
      const highFlags = flags.filter(f => f.flagType === 'flags');
      const warnings = flags.filter(f => f.flagType === 'warnings');

      if (highFlags.length > 0) {
        console.log(`   ${c.red}⚠️  Flags:${c.reset}`);
        highFlags.forEach(f => {
          console.log(`      • ${f.message}`);
        });
      }

      if (warnings.length > 0) {
        console.log(`   ${c.yellow}⚠️  Warnings:${c.reset}`);
        warnings.forEach(f => {
          console.log(`      • ${f.message}`);
        });
      }
    }

    console.log();
  }

  return concerningResults;
}

function generateChannelStats(channelProfiles) {
  header('📺 TOP CHANNELS');
  console.log('\nTop 10 most watched channels:\n');

  channelProfiles.slice(0, 10).forEach((channel, i) => {
    console.log(`${i + 1}. ${c.bright}${channel.channelTitle}${c.reset}`);
    console.log(`   Videos: ${channel.videosWatched} | Avg Views: ${formatNumber(Math.round(channel.avgViewCount))}`);
    if (channel.channelInfo) {
      console.log(`   Subscribers: ${formatNumber(channel.channelInfo.subscriberCount)}`);
    }
    if (channel.hasAgeRestriction) {
      console.log(`   ${c.yellow}⚠️  Has age-restricted content${c.reset}`);
    }
    console.log();
  });
}

async function generateCategoryBreakdown() {
  header('📊 CONTENT CATEGORIES');

  const categoryCounts = await db
    .select({
      categoryId: videos.categoryId,
      count: sql`COUNT(*)`,
    })
    .from(videos)
    .groupBy(videos.categoryId)
    .orderBy(sql`COUNT(*) DESC`);

  const total = categoryCounts.reduce((sum, c) => sum + Number(c.count), 0);
  console.log('\nVideo count by category:\n');

  categoryCounts.forEach(({categoryId, count}) => {
    const catName = CATEGORY_NAMES[categoryId] || 'Unknown';
    const pct = ((Number(count) / total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(Number(pct) / 2));
    console.log(`${catName.padEnd(25)} ${c.cyan}${bar}${c.reset} ${count} (${pct}%)`);
  });
}

function generateRecommendations(summary) {
  header('💡 RECOMMENDATIONS');

  const {highRisk, mediumRisk} = summary;

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

async function generateReport(allVideos, channelProfiles, classification, outputPath = null) {
  generateOverview(allVideos.length, channelProfiles.length, classification.summary);
  const concerningVideos = await generateConcerningContent();
  generateChannelStats(channelProfiles);
  await generateCategoryBreakdown();
  generateRecommendations(classification.summary);

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
