import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

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

function addIssue(list, type, severity, message) {
  list.push({type, severity, message});
}

function classifyVideo(video, blocklist, channelProfile) {
  const flags = [];
  const warnings = [];
  const info = [];

  // Check keywords
  const titleMatches = checkKeywords(video.title, blocklist.keywords);
  if (titleMatches.length) addIssue(flags, 'BLOCKLIST_TITLE', 'HIGH', `Title: ${titleMatches.join(', ')}`);

  const descMatches = checkKeywords(video.description, blocklist.keywords);
  if (descMatches.length) addIssue(flags, 'BLOCKLIST_DESCRIPTION', 'MEDIUM', `Description: ${descMatches.join(', ')}`);

  const tagMatches = checkKeywords(video.tags.join(' '), blocklist.keywords);
  if (tagMatches.length) addIssue(flags, 'BLOCKLIST_TAGS', 'MEDIUM', `Tags: ${tagMatches.join(', ')}`);

  // Check blocklists
  if (blocklist.channels.includes(video.channelId)) {
    addIssue(flags, 'BLOCKLIST_CHANNEL', 'HIGH', `Channel "${video.channelTitle}" is blocked`);
  }

  if (blocklist.categories.includes(video.categoryId)) {
    addIssue(flags, 'BLOCKLIST_CATEGORY', 'HIGH', `Category "${CATEGORY_NAMES[video.categoryId] || video.categoryId}" is blocked`);
  }

  // Check age restrictions
  if (video.contentRating && Object.keys(video.contentRating).length > 0) {
    addIssue(warnings, 'AGE_RESTRICTED', 'HIGH', `Age restricted: ${JSON.stringify(video.contentRating)}`);
  }

  if (video.madeForKids === false) {
    addIssue(info, 'NOT_FOR_KIDS', 'LOW', 'Not marked for kids');
  }

  // Channel reputation
  if (channelProfile?.hasAgeRestriction) {
    addIssue(warnings, 'CHANNEL_HAS_RESTRICTED_CONTENT', 'MEDIUM', `Channel has age-restricted content`);
  }

  if (channelProfile && channelProfile.madeForKidsRatio < 0.1 && channelProfile.videosWatched > 3) {
    addIssue(info, 'CHANNEL_NOT_KID_FOCUSED', 'LOW', 'Channel rarely posts kid content');
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
    flagCount: flags.length,
    warningCount: warnings.length
  };
}

function classifyAllVideos(videoDetails, channelProfiles) {
  console.log('🔍 Content Classifier');
  console.log('====================\n');

  const blocklist = loadBlocklist();
  console.log(`Blocklist: ${blocklist.keywords.length} keywords, ${blocklist.channels.length} channels, ${blocklist.categories.length} categories\n`);

  const channelLookup = Object.fromEntries(channelProfiles.map(p => [p.channelId, p]));

  const summary = {highRisk: 0, mediumRisk: 0, lowRisk: 0};
  const results = Object.values(videoDetails).map(video => {
    const result = classifyVideo(video, blocklist, channelLookup[video.channelId]);
    summary[result.riskLevel === 'HIGH' ? 'highRisk' : result.riskLevel === 'MEDIUM' ? 'mediumRisk' : 'lowRisk']++;
    return result;
  });

  console.log(`HIGH: ${summary.highRisk} | MEDIUM: ${summary.mediumRisk} | LOW: ${summary.lowRisk}\n`);

  return {
    results,
    summary: {total: results.length, ...summary},
    blocklist
  };
}

export {classifyAllVideos, CATEGORY_NAMES};
