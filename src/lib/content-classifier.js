import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {db, videos, classifications, classificationFlags} from '../db/index.js';
import {parseContentRating, getMostRestrictiveRating, getFlagSeverity, formatRating} from './rating-parser.js';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CATEGORY_NAMES = {
  '1': 'Film & Animation', '2': 'Autos & Vehicles', '10': 'Music', '15': 'Pets & Animals',
  '17': 'Sports', '18': 'Short Movies', '19': 'Travel & Events', '20': 'Gaming',
  '21': 'Videoblogging', '22': 'People & Blogs', '23': 'Comedy', '24': 'Entertainment',
  '25': 'News & Politics', '26': 'Howto & Style', '27': 'Education', '28': 'Science & Technology',
  '29': 'Nonprofits & Activism', '30': 'Movies', '31': 'Anime/Animation', '32': 'Action/Adventure',
  '33': 'Classics', '34': 'Comedy', '35': 'Documentary', '36': 'Drama', '37': 'Family',
  '38': 'Foreign', '39': 'Horror', '40': 'Sci-Fi/Fantasy', '41': 'Thriller', '42': 'Shorts',
  '43': 'Shows', '44': 'Trailers'
};

function loadBlocklist() {
  const blocklistPath = path.join(PROJECT_ROOT, 'config', 'blocklist.json');
  if (!fs.existsSync(blocklistPath)) {
    console.warn('⚠️  Blocklist not found');
    return {keywords: [], channels: [], categories: []};
  }
  return JSON.parse(fs.readFileSync(blocklistPath, 'utf-8'));
}

function checkKeywords(text, keywords) {
  if (!text) return [];
  const lowerText = text.toLowerCase();
  return keywords.filter(k => lowerText.includes(k.toLowerCase()));
}

function classifyVideo(video, blocklist, channelProfile) {
  const flags = [];
  const warnings = [];
  const info = [];

  // Check keywords
  const titleMatches = checkKeywords(video.title, blocklist.keywords);
  if (titleMatches.length) {
    flags.push({flagType: 'flags', type: 'BLOCKLIST_TITLE', severity: 'HIGH', message: `Title: ${titleMatches.join(', ')}`});
  }

  const descMatches = checkKeywords(video.description, blocklist.keywords);
  if (descMatches.length) {
    flags.push({flagType: 'flags', type: 'BLOCKLIST_DESCRIPTION', severity: 'MEDIUM', message: `Description: ${descMatches.join(', ')}`});
  }

  const tagMatches = checkKeywords((video.tags || []).join(' '), blocklist.keywords);
  if (tagMatches.length) {
    flags.push({flagType: 'flags', type: 'BLOCKLIST_TAGS', severity: 'MEDIUM', message: `Tags: ${tagMatches.join(', ')}`});
  }

  // Check blocklists
  if (blocklist.channels.includes(video.channelId)) {
    flags.push({flagType: 'flags', type: 'BLOCKLIST_CHANNEL', severity: 'HIGH', message: `Channel "${video.channelTitle}" is blocked`});
  }

  if (blocklist.categories.includes(video.categoryId)) {
    flags.push({flagType: 'flags', type: 'BLOCKLIST_CATEGORY', severity: 'HIGH', message: `Category "${CATEGORY_NAMES[video.categoryId] || video.categoryId}" is blocked`});
  }

  // Parse content ratings (MPAA, BBFC)
  const parsedRatings = parseContentRating(video.contentRating);

  if (parsedRatings.length > 0) {
    const mostRestrictive = getMostRestrictiveRating(parsedRatings);

    // Generate flags based on rating severity
    for (const rating of parsedRatings) {
      const flagSeverity = getFlagSeverity(rating.severity);
      const message = formatRating(rating);

      if (rating.severity === 'ADULT' || rating.severity === 'MATURE') {
        flags.push({flagType: 'flags', type: 'AGE_RATING_MATURE', severity: flagSeverity, message});
      } else if (rating.severity === 'TEEN') {
        warnings.push({flagType: 'warnings', type: 'AGE_RATING_TEEN', severity: flagSeverity, message});
      } else if (rating.severity === 'GUIDANCE') {
        info.push({flagType: 'info', type: 'AGE_RATING_GUIDANCE', severity: flagSeverity, message});
      }
    }
  }

  // Check for madeForKids mismatch
  if (video.madeForKids !== undefined && video.selfDeclaredMadeForKids !== undefined) {
    if (video.madeForKids !== video.selfDeclaredMadeForKids) {
      const mismatchMsg = video.selfDeclaredMadeForKids === false
        ? 'Creator declared NOT for kids, but YouTube determined it IS for kids'
        : 'Creator declared for kids, but YouTube determined it is NOT for kids';
      info.push({flagType: 'info', type: 'MADE_FOR_KIDS_MISMATCH', severity: 'LOW', message: mismatchMsg});
    }
  }

  // Flag content not made for kids
  if (video.madeForKids === false) {
    info.push({flagType: 'info', type: 'NOT_FOR_KIDS', severity: 'LOW', message: 'Not marked for kids'});
  }

  // Channel reputation
  if (channelProfile?.hasAgeRestriction) {
    warnings.push({flagType: 'warnings', type: 'CHANNEL_HAS_RESTRICTED_CONTENT', severity: 'MEDIUM', message: 'Channel has age-restricted content'});
  }

  if (channelProfile && channelProfile.madeForKidsRatio < 0.1 && channelProfile.videosWatched > 3) {
    info.push({flagType: 'info', type: 'CHANNEL_NOT_KID_FOCUSED', severity: 'LOW', message: 'Channel rarely posts kid content'});
  }

  const riskLevel = flags.length > 0 ? 'HIGH' : warnings.length > 0 ? 'MEDIUM' : 'LOW';

  return {
    videoId: video.id,
    title: video.title,
    channelTitle: video.channelTitle,
    categoryId: video.categoryId,
    categoryName: CATEGORY_NAMES[video.categoryId] || 'Unknown',
    riskLevel,
    flags,
    warnings,
    info,
  };
}

async function classifyAllVideos(allVideos, channelProfiles) {
  console.log('🔍 Content Classifier');
  console.log('====================\n');

  const blocklist = loadBlocklist();
  console.log(`Blocklist: ${blocklist.keywords.length} keywords, ${blocklist.channels.length} channels, ${blocklist.categories.length} categories\n`);

  const channelLookup = Object.fromEntries(channelProfiles.map(p => [p.channelId, p]));

  // Clear existing classifications
  await db.delete(classifications);
  await db.delete(classificationFlags);

  const summary = {highRisk: 0, mediumRisk: 0, lowRisk: 0};
  const results = [];

  for (const video of allVideos) {
    const result = classifyVideo(video, blocklist, channelLookup[video.channelId]);
    results.push(result);

    // Update summary
    summary[result.riskLevel === 'HIGH' ? 'highRisk' : result.riskLevel === 'MEDIUM' ? 'mediumRisk' : 'lowRisk']++;

    // Insert classification
    await db.insert(classifications).values({
      videoId: result.videoId,
      riskLevel: result.riskLevel,
      flagCount: result.flags.length,
      warningCount: result.warnings.length,
      infoCount: result.info.length,
    });

    // Insert all flags
    const allFlags = [...result.flags, ...result.warnings, ...result.info].map(f => ({
      videoId: result.videoId,
      ...f
    }));

    if (allFlags.length > 0) {
      await db.insert(classificationFlags).values(allFlags);
    }
  }

  console.log(`HIGH: ${summary.highRisk} | MEDIUM: ${summary.mediumRisk} | LOW: ${summary.lowRisk}\n`);

  return {
    results,
    summary: {total: results.length, ...summary},
    blocklist
  };
}

export {classifyAllVideos, CATEGORY_NAMES};
