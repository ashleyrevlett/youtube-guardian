#!/usr/bin/env node

// Display report from existing AI analysis data
import 'dotenv/config';
import {generateReport} from '../lib/report-generator.js';

async function main() {
  try {
    await generateReport();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
