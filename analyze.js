#!/usr/bin/env node

/**
 * YouTube Guardian - Main Analysis Script
 *
 * Analyzes YouTube watch history and generates a parental monitoring report
 *
 * Usage: npm run analyze
 */

import 'dotenv/config';
import path from 'path';
import {fileURLToPath} from 'url';
import {analyzeVideos} from './video-analyzer.js';
import {analyzeChannels} from './channel-analyzer.js';
import {classifyAllVideos} from './content-classifier.js';
import {generateReport} from './report-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File paths
const DATA_DIR = path.join(__dirname, 'data');
const VIDEO_IDS_PATH = path.join(DATA_DIR, 'video-ids.json');
const WATCH_HISTORY_PATH = path.join(DATA_DIR, 'watch-history.json');
const VIDEO_DETAILS_PATH = path.join(DATA_DIR, 'video-details.json');
const CHANNEL_PROFILES_PATH = path.join(DATA_DIR, 'channel-profiles.json');
const CHANNEL_CACHE_PATH = path.join(DATA_DIR, 'channel-cache.json');
const ANALYSIS_RESULTS_PATH = path.join(DATA_DIR, 'analysis-results.json');

/**
 * Main analysis function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              🛡️  YOUTUBE GUARDIAN ANALYZER 🛡️                 ║');
  console.log('║                 Parental Monitoring System                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Fetch video details from YouTube API
    console.log('Step 1/4: Fetching video details from YouTube API...\n');
    const videoDetails = await analyzeVideos(VIDEO_IDS_PATH, VIDEO_DETAILS_PATH);

    // Step 2: Analyze channels
    console.log('\nStep 2/4: Analyzing channel profiles...\n');
    const channelProfiles = await analyzeChannels(
      VIDEO_DETAILS_PATH,
      WATCH_HISTORY_PATH,
      CHANNEL_PROFILES_PATH,
      CHANNEL_CACHE_PATH
    );

    // Step 3: Classify content
    console.log('\nStep 3/4: Classifying content...\n');
    const classification = classifyAllVideos(videoDetails, channelProfiles);

    // Step 4: Generate report
    console.log('\nStep 4/4: Generating report...\n');
    generateReport(videoDetails, channelProfiles, classification, ANALYSIS_RESULTS_PATH);

    console.log('✅ Analysis complete!\n');

  } catch (error) {
    console.error('\n❌ Error during analysis:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the analysis
main();
