#!/usr/bin/env node

// Ingest metadata: Parse watch history, fetch YouTube data, download captions
import 'dotenv/config';
import path from 'path';
import {fileURLToPath} from 'url';
import fs from 'fs';
import {db, watchHistory, videos} from '../db/index.js';
import {analyzeVideos} from '../lib/video-analyzer.js';
import {analyzeChannels} from '../lib/channel-analyzer.js';
import {downloadAllCaptions} from '../lib/caption-downloader.js';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = path.join(PROJECT_ROOT, 'data');
const WATCH_HISTORY_FILE = path.join(DATA, 'watch-history.json');

async function parseWatchHistory() {
  console.log('📋 Parsing watch history...\n');

  if (!fs.existsSync(WATCH_HISTORY_FILE)) {
    console.error('❌ watch-history.json not found at:', WATCH_HISTORY_FILE);
    console.log('\nPlease export your YouTube watch history from Google Takeout');
    console.log('and place it at data/watch-history.json\n');
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(WATCH_HISTORY_FILE, 'utf-8'));

  let totalEntries = 0;
  let videoEntries = 0;
  let adEntries = 0;
  let gameEntries = 0;

  for (const entry of rawData) {
    totalEntries++;

    // Skip entries without titleUrl (incomplete data)
    if (!entry.titleUrl) continue;

    // Filter out ads
    if (entry.titleUrl.includes('googleadservices.com')) {
      adEntries++;
      continue;
    }

    // Filter out games
    if (entry.titleUrl.includes('/games/')) {
      gameEntries++;
      continue;
    }

    // Extract video ID from URL
    const match = entry.titleUrl.match(/[?&]v=([^&]+)/);
    if (!match) continue;

    const videoId = match[1];

    // Store in database
    await db.insert(watchHistory).values({
      videoId,
      title: entry.title,
      watchedAt: entry.time,
      channel: entry.subtitles?.[0]?.name
    }).onConflictDoNothing();

    videoEntries++;
  }

  console.log(`  Total entries: ${totalEntries}`);
  console.log(`  Videos: ${videoEntries}`);
  console.log(`  Ads filtered: ${adEntries}`);
  console.log(`  Games filtered: ${gameEntries}\n`);

  return videoEntries;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              🛡️  YOUTUBE GUARDIAN - INGEST 🛡️                 ║');
  console.log('║                Metadata Collection Pipeline                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Parse optional limit argument
  const limitArg = process.argv[2];
  const limit = limitArg ? parseInt(limitArg, 10) : null;

  if (limitArg && (isNaN(limit) || limit <= 0)) {
    console.error('❌ Error: Limit must be a positive number\n');
    console.log('Usage: npm run ingest [limit]\n');
    console.log('Examples:');
    console.log('  npm run ingest     # Ingest all videos');
    console.log('  npm run ingest 5   # Ingest only 5 videos\n');
    process.exit(1);
  }

  if (limit) {
    console.log(`⚠️  Limit: ${limit} videos\n`);
  }

  try {
    // Step 1: Parse watch history
    console.log('Step 1/4: Parsing watch history...\n');
    await parseWatchHistory();

    // Step 2: Fetch video metadata from YouTube API
    console.log('Step 2/4: Fetching video metadata...\n');
    await analyzeVideos(limit);

    // Step 3: Analyze channels
    console.log('\nStep 3/4: Analyzing channels...\n');
    await analyzeChannels();

    // Step 4: Download captions
    console.log('\nStep 4/4: Downloading captions...\n');
    const allVideos = await db.select().from(videos);
    let videoIds = allVideos.map(v => v.id);

    // Apply limit if specified
    if (limit && videoIds.length > limit) {
      videoIds = videoIds.slice(0, limit);
    }

    const results = await downloadAllCaptions(videoIds);

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Metadata ingestion complete!');
    console.log(`\n  Videos in database: ${allVideos.length}`);
    console.log(`  Captions downloaded: ${results.success}\n`);
    console.log('Next step: Run "npm run analyze" for AI content analysis\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
