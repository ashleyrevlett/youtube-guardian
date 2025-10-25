#!/usr/bin/env node

// Content analysis: AI analysis + reporting
import 'dotenv/config';
import readline from 'readline';
import {db, videos} from '../db/index.js';
import {areCaptionsDownloaded} from '../lib/caption-downloader.js';
import {analyzeAllVideos} from '../lib/ai-analyzer.js';
import {generateReport} from '../lib/report-generator.js';

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
