#!/usr/bin/env node

// CLI tool to display AI analysis report
import {db, videos, tags, videoTags, aiAnalysis} from '../db/index.js';
import {eq, sql} from 'drizzle-orm';

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

async function main() {
  console.log(colorize('\n🤖 AI Content Analysis Report', 'bold'));
  console.log('='.repeat(80) + '\n');

  // Get all videos with AI analysis
  const allVideos = await db.select().from(videos);
  const allAnalysis = await db.select().from(aiAnalysis);

  if (allAnalysis.length === 0) {
    console.log(colorize('❌ No AI analysis found', 'red'));
    console.log('Run "npm run analyze:ai" first to analyze videos\n');
    process.exit(0);
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

    // Row 3: Reasoning (only for HIGH/MEDIUM)
    if (analysis.reasoning && (riskLevel === 'HIGH' || riskLevel === 'MEDIUM')) {
      console.log(`${' '.repeat(14)}${colorize('→ ', 'gray')}${analysis.reasoning}`);
    }

    console.log();
  });

  console.log('='.repeat(80));
  console.log(colorize('\n✅ Report complete\n', 'green'));
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
