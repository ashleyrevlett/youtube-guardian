#!/usr/bin/env node

// CLI tool to download YouTube videos for AI content analysis
import {downloadAllVideos, getDownloadedVideos, formatBytes, getTotalSize} from '../lib/video-downloader.js';
import {db, videos} from '../db/index.js';

async function main() {
  console.log('📥 YouTube Guardian - Video Downloader');
  console.log('======================================\n');

  // Check for API endpoint argument
  const apiEndpoint = process.argv[2];

  if (!apiEndpoint) {
    console.error('❌ Error: API endpoint required\n');
    console.log('Usage: npm run download <api-endpoint>\n');
    console.log('Example:');
    console.log('  npm run download "https://downr.org/.netlify/functions/download"\n');
    console.log('The endpoint should accept POST requests with:');
    console.log('  Body: { "url": "https://www.youtube.com/watch?v=VIDEO_ID" }');
    console.log('  Response: { "medias": [...], ... }\n');
    process.exit(1);
  }

  console.log(`API Endpoint: ${apiEndpoint}`);
  console.log(`Storage: data/videos/\n`);

  try {
    // Get all video IDs from database
    const allVideos = await db.select({id: videos.id}).from(videos);

    if (allVideos.length === 0) {
      console.log('❌ No videos found in database');
      console.log('Run "npm run parse" first to parse watch history\n');
      process.exit(1);
    }

    const videoIds = allVideos.map(v => v.id);

    // Check which are already downloaded
    const alreadyDownloaded = getDownloadedVideos();

    console.log(`Found ${videoIds.length} videos in database`);
    console.log(`Already downloaded: ${alreadyDownloaded.length} videos`);

    if (alreadyDownloaded.length > 0) {
      const existingSize = getTotalSize();
      console.log(`Existing downloads: ${formatBytes(existingSize)}`);
    }

    const pendingCount = videoIds.filter(id => !alreadyDownloaded.includes(id)).length;
    console.log(`Pending download: ${pendingCount} videos`);

    if (pendingCount === 0) {
      console.log('\n✅ All videos already downloaded!\n');
      process.exit(0);
    }

    console.log('\n⚠️  Note: Downloads are rate-limited to avoid API bans');
    console.log('This may take several minutes. You can stop (Ctrl+C) and resume later.\n');

    // Download all videos with rate limiting
    const results = await downloadAllVideos(videoIds, apiEndpoint);

    // Final summary
    if (results.success > 0) {
      console.log('✅ Download complete!');
      console.log(`\nVideos saved to: data/videos/`);
      console.log(`Use "npm run cleanup-videos" to delete when done\n`);
    } else if (results.rateLimited > 0) {
      console.log('⚠️  Stopped due to rate limiting');
      console.log('Wait a few minutes and run this command again to resume.\n');
      process.exit(1);
    } else {
      console.log('❌ No videos were downloaded');
      if (results.errors.length > 0) {
        console.log('\nErrors:');
        results.errors.slice(0, 5).forEach(e => {
          console.log(`  - ${e.videoId}: ${e.error}`);
        });
        if (results.errors.length > 5) {
          console.log(`  ... and ${results.errors.length - 5} more errors`);
        }
      }
      console.log();
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
