#!/usr/bin/env node

// Content analysis: AI analysis + reporting
import 'dotenv/config';
import readline from 'readline';
import {db, videos, tags, videoTags, aiAnalysis} from '../db/index.js';
import {areCaptionsDownloaded} from '../lib/caption-downloader.js';
import {analyzeAllVideos} from '../lib/ai-analyzer.js';

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

function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

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

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              🛡️  YOUTUBE GUARDIAN - ANALYZE 🛡️                ║');
  console.log('║                  Content Analysis Pipeline                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY environment variable not set\n');
    console.log('Set it with:');
    console.log('  export OPENAI_API_KEY=sk-proj-...\n');
    console.log('Or add to .env file:');
    console.log('  OPENAI_API_KEY=sk-proj-...\n');
    process.exit(1);
  }

  // Parse optional limit argument
  const limitArg = process.argv[2];
  const limit = limitArg ? parseInt(limitArg, 10) : null;

  if (limitArg && (isNaN(limit) || limit <= 0)) {
    console.error('❌ Error: Limit must be a positive number\n');
    console.log('Usage: npm run analyze [limit]\n');
    console.log('Examples:');
    console.log('  npm run analyze     # Analyze all videos');
    console.log('  npm run analyze 3   # Analyze only 3 videos\n');
    process.exit(1);
  }

  try {
    // Get all videos
    const allVideos = await db.select().from(videos);

    if (allVideos.length === 0) {
      console.log('❌ No videos found in database');
      console.log('Run "npm run ingest" first to collect metadata\n');
      process.exit(1);
    }

    // Count videos with captions
    const withCaptions = allVideos.filter(v => areCaptionsDownloaded(v.id));

    if (withCaptions.length === 0) {
      console.log('❌ No videos have captions');
      console.log('Run "npm run ingest" first to download captions\n');
      process.exit(1);
    }

    console.log(`Found ${withCaptions.length} videos with captions`);
    if (limit) {
      console.log(`Limit: ${limit} videos`);
    }
    console.log(`Model: gpt-4o-mini`);

    // Estimate cost (~$0.0002 per video)
    const videosToProcess = limit ? Math.min(limit, withCaptions.length) : withCaptions.length;
    const estimatedCost = videosToProcess * 0.0002;
    console.log(`Estimated cost: $${estimatedCost.toFixed(3)}\n`);

    // Ask for confirmation
    const confirmed = await askConfirmation('Proceed with AI analysis? (y/N): ');

    if (!confirmed) {
      console.log('\nCancelled.\n');
      process.exit(0);
    }

    // Run AI analysis
    console.log('\nAnalyzing videos with AI...\n');
    const results = await analyzeAllVideos(limit);

    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('\nAI Analysis Summary:');
    console.log(`  ✓ Analyzed: ${results.analyzed} videos`);
    console.log(`  ⊘ Skipped: ${results.skipped} videos (already analyzed)`);
    console.log(`  ✗ Failed: ${results.failed} videos`);

    if (results.errors.length > 0) {
      console.log('\nErrors:');
      results.errors.slice(0, 5).forEach(e => {
        console.log(`  - ${e.videoId}: ${e.error}`);
      });
      if (results.errors.length > 5) {
        console.log(`  ... and ${results.errors.length - 5} more errors`);
      }
    }

    if (results.analyzed > 0) {
      console.log('\n✅ AI analysis complete!');
      console.log('Tags and risk assessments stored in database.\n');
    }

    // Auto-generate report
    await generateReport();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
