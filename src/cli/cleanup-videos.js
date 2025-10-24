#!/usr/bin/env node

// CLI tool to clean up downloaded videos
import {cleanupAllVideos, getDownloadedVideos, getTotalSize, formatBytes} from '../lib/video-downloader.js';
import readline from 'readline';

function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function main() {
  console.log('🗑️  YouTube Guardian - Video Cleanup');
  console.log('====================================\n');

  // Get current state
  const downloaded = getDownloadedVideos();
  const totalSize = getTotalSize();

  if (downloaded.length === 0) {
    console.log('✓ No downloaded videos found');
    console.log('Nothing to clean up!\n');
    process.exit(0);
  }

  console.log(`Found ${downloaded.length} downloaded videos`);
  console.log(`Total size: ${formatBytes(totalSize)}\n`);

  // Show first few video IDs as examples
  if (downloaded.length > 0) {
    console.log('Videos:');
    downloaded.slice(0, 5).forEach(id => {
      console.log(`  - ${id}.mp4`);
    });
    if (downloaded.length > 5) {
      console.log(`  ... and ${downloaded.length - 5} more`);
    }
    console.log();
  }

  // Ask for confirmation
  const confirmed = await askConfirmation(`⚠️  Delete all ${downloaded.length} videos? This cannot be undone. (y/N): `);

  if (!confirmed) {
    console.log('\nCancelled. No videos were deleted.\n');
    process.exit(0);
  }

  // Clean up all videos
  console.log('\nDeleting videos...');
  const deletedCount = cleanupAllVideos();

  console.log(`\n✅ Cleanup complete!`);
  console.log(`Deleted ${deletedCount} videos (freed ${formatBytes(totalSize)})\n`);
}

main();
