#!/usr/bin/env node
import 'dotenv/config';
import path from 'path';
import {fileURLToPath} from 'url';
import {analyzeVideos} from '../lib/video-analyzer.js';
import {analyzeChannels} from '../lib/channel-analyzer.js';
import {classifyAllVideos} from '../lib/content-classifier.js';
import {generateReport} from '../lib/report-generator.js';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = path.join(PROJECT_ROOT, 'data');

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              🛡️  YOUTUBE GUARDIAN ANALYZER 🛡️                 ║');
  console.log('║                 Parental Monitoring System                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('Step 1/4: Fetching video details...\n');
    const videoDetails = await analyzeVideos(
      path.join(DATA, 'video-ids.json'),
      path.join(DATA, 'video-details.json')
    );

    console.log('\nStep 2/4: Analyzing channels...\n');
    const channelProfiles = await analyzeChannels(
      path.join(DATA, 'video-details.json'),
      path.join(DATA, 'watch-history.json'),
      path.join(DATA, 'channel-profiles.json'),
      path.join(DATA, 'channel-cache.json')
    );

    console.log('\nStep 3/4: Classifying content...\n');
    const classification = classifyAllVideos(videoDetails, channelProfiles);

    console.log('\nStep 4/4: Generating report...\n');
    generateReport(videoDetails, channelProfiles, classification, path.join(DATA, 'analysis-results.json'));

    console.log('✅ Analysis complete!\n');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
