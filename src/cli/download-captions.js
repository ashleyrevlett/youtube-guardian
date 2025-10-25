#!/usr/bin/env node

// CLI tool to download captions/subtitles for YouTube videos
import {downloadAllCaptions} from '../lib/caption-downloader.js';
import {db, videos} from '../db/index.js';

async function main() {
  console.log('📝 YouTube Guardian - Caption Downloader');
  console.log('=========================================\n');

  console.log('Using: yt-dlp binary');
  console.log(`Storage: data/captions/\n`);

  try {
    // Get all video IDs from database
    const allVideos = await db.select({id: videos.id}).from(videos);

    if (allVideos.length === 0) {
      console.log('❌ No videos found in database');
      console.log('Run "npm run parse" first to parse watch history\n');
      process.exit(1);
    }

    const videoIds = allVideos.map(v => v.id);

    console.log(`Found ${videoIds.length} videos in database`);
    console.log('\n⚠️  Note: Not all videos have captions/subtitles available');
    console.log('Downloading English captions (auto-generated or manual)...\n');

    // Download all captions
    const results = await downloadAllCaptions(videoIds);

    // Final summary
    if (results.success > 0) {
      console.log('✅ Caption download complete!');
      console.log(`\nCaptions saved to: data/captions/`);
      console.log(`Files are in SRT format (plain text with timestamps)\n`);
    } else if (results.noCaptions === videoIds.length) {
      console.log('⚠️  No videos had captions available\n');
    } else {
      console.log('⚠️  Caption download completed with some failures');
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
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
