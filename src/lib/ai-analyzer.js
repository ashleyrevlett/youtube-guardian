// AI content analyzer using OpenAI and caption transcripts
import 'dotenv/config';
import OpenAI from 'openai';
import srtParser2 from 'srt-parser-2';
import fs from 'fs';
import {getCaptionFile} from './caption-downloader.js';
import {db, aiAnalysis, tags, videoTags, videos} from '../db/index.js';
import {eq} from 'drizzle-orm';

const SYSTEM_PROMPT = `You are a content safety analyzer detecting objectionable content in video transcripts.

Analyze the transcript across these dimensions:

CONTENT FLAGS - Detect any of these objectionable elements:
1. Political Content
   - extreme-political: Extreme political views, conspiracy theories, political radicalization
   - political-divisive: Highly divisive political commentary, partisan attacks

2. Offensive/Inappropriate
   - profanity: Excessive swearing, vulgar language
   - sexual-content: Sexual references, innuendo, adult themes
   - graphic-violence: Descriptions of graphic violence, gore
   - hate-speech: Racist, sexist, homophobic, or discriminatory content

3. Harmful Content
   - misinformation: Clear misinformation, dangerous medical/health claims
   - scary-disturbing: Horror content, disturbing imagery descriptions
   - exploitation: Clickbait, manipulation, exploitative content

4. Tone/Style
   - obnoxious: Overly loud, annoying, aggressive presentation style
   - inflammatory: Deliberately provocative, rage-baiting content

Return JSON:
{
  "summary": "One sentence video description",
  "tags": ["topic1", "topic2"],
  "contentFlags": ["flag1", "flag2"],
  "flaggedSeverity": "SEVERE|MODERATE|NONE",
  "riskLevel": "HIGH|MEDIUM|LOW",
  "reasoning": "Explanation of flags and risk"
}

Guidelines:
- tags are general topics (gaming, cooking, education, etc.)
- contentFlags should be empty array if no objectionable content (use flag keys listed above)
- flaggedSeverity: SEVERE = multiple serious flags or extreme content, MODERATE = some concerning elements, NONE = clean
- riskLevel considers both content appropriateness AND flags`;

/**
 * Parse SRT caption file to plain text transcript
 * @param {string} videoId - YouTube video ID
 * @returns {string|null} Transcript text or null if not found
 */
function parseTranscript(videoId) {
  const captionFile = getCaptionFile(videoId);
  if (!captionFile) return null;

  const parser = new srtParser2();
  const srtContent = fs.readFileSync(captionFile, 'utf-8');
  const parsed = parser.fromSrt(srtContent);

  // Extract just text from SRT entries and join
  return parsed.map(entry => entry.text).join(' ');
}

/**
 * Call OpenAI API to analyze transcript
 * @param {string} transcript - Video transcript text
 * @returns {Promise<{tags: string[], riskLevel: string, reasoning: string}>}
 */
async function analyzeWithAI(transcript) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  // Truncate very long transcripts (GPT-4o-mini can handle ~128k tokens, but keep it reasonable)
  const truncated = transcript.substring(0, 10000);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 500,
    messages: [
      {role: 'system', content: SYSTEM_PROMPT},
      {role: 'user', content: `Analyze this transcript:\n\n${truncated}`}
    ],
    response_format: {type: 'json_object'}
  });

  return JSON.parse(response.choices[0].message.content);
}

/**
 * Store tags in normalized database schema (many-to-many)
 * Merges YouTube's native tags with AI-generated tags
 * @param {string} videoId - YouTube video ID
 * @param {string[]} aiTagNames - Array of AI-generated tag names
 */
async function storeTags(videoId, aiTagNames) {
  // Get YouTube's native tags from videos table
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
  const youtubeTags = video?.tags || [];

  // Merge YouTube tags + AI tags (deduplicated, case-insensitive)
  const allTagNames = [...youtubeTags, ...aiTagNames];
  const uniqueTags = [...new Set(allTagNames.map(t => t.toLowerCase()))];

  const tagIds = [];

  for (const tagName of uniqueTags) {
    // Get or create tag
    const existingTags = await db.select().from(tags).where(eq(tags.name, tagName));

    if (existingTags.length === 0) {
      // Create new tag
      const [newTag] = await db.insert(tags).values({name: tagName}).returning();
      tagIds.push(newTag.id);
    } else {
      tagIds.push(existingTags[0].id);
    }
  }

  // Create video-tag relationships
  for (const tagId of tagIds) {
    await db.insert(videoTags).values({
      videoId,
      tagId
    }).onConflictDoNothing();
  }
}

/**
 * Analyze single video with AI
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<{tags: string[], riskLevel: string, reasoning: string}>}
 */
async function analyzeVideo(videoId) {
  // 1. Parse transcript from caption file
  const transcript = parseTranscript(videoId);
  if (!transcript) {
    throw new Error('No transcript available');
  }

  // 2. Analyze with OpenAI
  const result = await analyzeWithAI(transcript);

  // 3. Store tags in normalized schema
  await storeTags(videoId, result.tags);

  // 4. Store AI analysis results
  await db.insert(aiAnalysis).values({
    videoId,
    riskLevel: result.riskLevel,
    summary: result.summary,
    reasoning: result.reasoning,
    contentFlags: result.contentFlags || [],
    flaggedSeverity: result.flaggedSeverity || 'NONE',
    model: 'gpt-4o-mini'
  });

  return result;
}

/**
 * Batch analyze all videos with captions
 * @param {number|null} limit - Optional limit on number of videos to analyze
 * @returns {Promise<{analyzed: number, failed: number, skipped: number, errors: Array}>}
 */
async function analyzeAllVideos(limit = null) {
  const {areCaptionsDownloaded} = await import('./caption-downloader.js');

  // Get all videos
  const allVideos = await db.select().from(videos);

  // Get already analyzed videos
  const analyzedVideos = await db.select().from(aiAnalysis);
  const analyzedIds = analyzedVideos.map(a => a.videoId);

  // Filter to videos with captions that haven't been analyzed yet
  const toAnalyze = allVideos.filter(v =>
    areCaptionsDownloaded(v.id) && !analyzedIds.includes(v.id)
  );

  // Apply limit if specified
  const limitedToAnalyze = limit ? toAnalyze.slice(0, limit) : toAnalyze;

  const results = {
    analyzed: 0,
    failed: 0,
    skipped: allVideos.length - limitedToAnalyze.length,
    errors: []
  };

  const limitMsg = limit ? ` (limited to ${limit})` : '';
  console.log(`\nAnalyzing ${limitedToAnalyze.length} videos with AI${limitMsg}...\n`);

  for (let i = 0; i < limitedToAnalyze.length; i++) {
    const video = limitedToAnalyze[i];
    const progress = `[${i + 1}/${limitedToAnalyze.length}]`;

    try {
      const result = await analyzeVideo(video.id);
      results.analyzed++;

      console.log(`${progress} ✓ ${video.id} - ${result.tags.length} tags, ${result.riskLevel} risk`);

    } catch (error) {
      results.failed++;
      results.errors.push({videoId: video.id, error: error.message});
      console.log(`${progress} ✗ ${video.id} - ${error.message}`);
    }
  }

  return results;
}

export {analyzeVideo, analyzeAllVideos, parseTranscript};
