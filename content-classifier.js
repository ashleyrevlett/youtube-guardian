import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// YouTube category ID mappings
const CATEGORY_NAMES = {
  '1': 'Film & Animation',
  '2': 'Autos & Vehicles',
  '10': 'Music',
  '15': 'Pets & Animals',
  '17': 'Sports',
  '18': 'Short Movies',
  '19': 'Travel & Events',
  '20': 'Gaming',
  '21': 'Videoblogging',
  '22': 'People & Blogs',
  '23': 'Comedy',
  '24': 'Entertainment',
  '25': 'News & Politics',
  '26': 'Howto & Style',
  '27': 'Education',
  '28': 'Science & Technology',
  '29': 'Nonprofits & Activism',
  '30': 'Movies',
  '31': 'Anime/Animation',
  '32': 'Action/Adventure',
  '33': 'Classics',
  '34': 'Comedy',
  '35': 'Documentary',
  '36': 'Drama',
  '37': 'Family',
  '38': 'Foreign',
  '39': 'Horror',
  '40': 'Sci-Fi/Fantasy',
  '41': 'Thriller',
  '42': 'Shorts',
  '43': 'Shows',
  '44': 'Trailers'
};

/**
 * Load blocklist configuration
 */
function loadBlocklist() {
  const blocklistPath = path.join(__dirname, 'config', 'blocklist.json');

  if (!fs.existsSync(blocklistPath)) {
    console.warn('⚠️  Blocklist not found, creating default...');
    return {
      keywords: [],
      channels: [],
      categories: []
    };
  }

  return JSON.parse(fs.readFileSync(blocklistPath, 'utf-8'));
}

/**
 * Check if text contains any blocklisted keywords
 * @param {string} text - Text to check
 * @param {string[]} keywords - Blocklisted keywords
 * @returns {string[]} Matched keywords
 */
function checkKeywords(text, keywords) {
  if (!text) return [];

  const lowerText = text.toLowerCase();
  const matches = [];

  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    if (lowerText.includes(lowerKeyword)) {
      matches.push(keyword);
    }
  }

  return matches;
}

/**
 * Classify a single video
 * @param {Object} video - Video details
 * @param {Object} blocklist - Blocklist configuration
 * @param {Object} channelProfile - Channel profile (optional)
 * @returns {Object} Classification result
 */
function classifyVideo(video, blocklist, channelProfile = null) {
  const flags = [];
  const warnings = [];
  const info = [];

  // Check blocklisted keywords in title
  const titleMatches = checkKeywords(video.title, blocklist.keywords);
  if (titleMatches.length > 0) {
    flags.push({
      type: 'BLOCKLIST_TITLE',
      severity: 'HIGH',
      message: `Title contains blocklisted keywords: ${titleMatches.join(', ')}`
    });
  }

  // Check blocklisted keywords in description
  const descMatches = checkKeywords(video.description, blocklist.keywords);
  if (descMatches.length > 0) {
    flags.push({
      type: 'BLOCKLIST_DESCRIPTION',
      severity: 'MEDIUM',
      message: `Description contains blocklisted keywords: ${descMatches.join(', ')}`
    });
  }

  // Check blocklisted keywords in tags
  const tagText = video.tags.join(' ');
  const tagMatches = checkKeywords(tagText, blocklist.keywords);
  if (tagMatches.length > 0) {
    flags.push({
      type: 'BLOCKLIST_TAGS',
      severity: 'MEDIUM',
      message: `Tags contain blocklisted keywords: ${tagMatches.join(', ')}`
    });
  }

  // Check blocklisted channel
  if (blocklist.channels.includes(video.channelId)) {
    flags.push({
      type: 'BLOCKLIST_CHANNEL',
      severity: 'HIGH',
      message: `Channel "${video.channelTitle}" is on blocklist`
    });
  }

  // Check blocklisted category
  if (blocklist.categories.includes(video.categoryId)) {
    flags.push({
      type: 'BLOCKLIST_CATEGORY',
      severity: 'HIGH',
      message: `Category "${CATEGORY_NAMES[video.categoryId] || video.categoryId}" is on blocklist`
    });
  }

  // Check age restrictions
  if (video.contentRating && Object.keys(video.contentRating).length > 0) {
    warnings.push({
      type: 'AGE_RESTRICTED',
      severity: 'HIGH',
      message: `Video has age restrictions: ${JSON.stringify(video.contentRating)}`
    });
  }

  // Check if NOT made for kids (might be adult content)
  if (video.madeForKids === false) {
    info.push({
      type: 'NOT_FOR_KIDS',
      severity: 'LOW',
      message: 'Video is not marked as made for kids'
    });
  }

  // Check channel reputation if available
  if (channelProfile) {
    if (channelProfile.hasAgeRestriction) {
      warnings.push({
        type: 'CHANNEL_HAS_RESTRICTED_CONTENT',
        severity: 'MEDIUM',
        message: `Channel "${channelProfile.channelTitle}" has posted age-restricted content`
      });
    }

    // If channel has low made-for-kids ratio
    if (channelProfile.madeForKidsRatio < 0.1 && channelProfile.videosWatched > 3) {
      info.push({
        type: 'CHANNEL_NOT_KID_FOCUSED',
        severity: 'LOW',
        message: `Channel "${channelProfile.channelTitle}" rarely posts kid-focused content`
      });
    }
  }

  // Determine overall risk level
  let riskLevel = 'LOW';
  if (flags.length > 0) {
    riskLevel = 'HIGH';
  } else if (warnings.length > 0) {
    riskLevel = 'MEDIUM';
  }

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
    flagCount: flags.length,
    warningCount: warnings.length
  };
}

/**
 * Classify all videos
 * @param {Object} videoDetails - All video details
 * @param {Array} channelProfiles - Channel profiles
 * @returns {Object} Classification results
 */
function classifyAllVideos(videoDetails, channelProfiles) {
  console.log('🔍 Content Classifier');
  console.log('====================\n');

  const blocklist = loadBlocklist();
  console.log(`Loaded blocklist with ${blocklist.keywords.length} keywords, ${blocklist.channels.length} channels, ${blocklist.categories.length} categories\n`);

  // Create channel lookup
  const channelLookup = {};
  for (const profile of channelProfiles) {
    channelLookup[profile.channelId] = profile;
  }

  // Classify each video
  const results = [];
  let highRisk = 0;
  let mediumRisk = 0;
  let lowRisk = 0;

  for (const video of Object.values(videoDetails)) {
    const channelProfile = channelLookup[video.channelId];
    const classification = classifyVideo(video, blocklist, channelProfile);
    results.push(classification);

    if (classification.riskLevel === 'HIGH') highRisk++;
    else if (classification.riskLevel === 'MEDIUM') mediumRisk++;
    else lowRisk++;
  }

  console.log('Classification Summary:');
  console.log(`  HIGH risk:   ${highRisk} videos`);
  console.log(`  MEDIUM risk: ${mediumRisk} videos`);
  console.log(`  LOW risk:    ${lowRisk} videos`);
  console.log();

  return {
    results: results,
    summary: {
      total: results.length,
      highRisk,
      mediumRisk,
      lowRisk
    },
    blocklist
  };
}

export {classifyAllVideos, classifyVideo, loadBlocklist, CATEGORY_NAMES};
