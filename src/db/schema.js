import {sqliteTable, text, integer, real} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';

// IMPORTANT: After modifying this schema, run `npm run db:generate` to create a new migration file

// Watch history entries parsed from Google Takeout
export const watchHistory = sqliteTable('watch_history', {
  id: integer('id').primaryKey({autoIncrement: true}),
  videoId: text('video_id').notNull(),
  watchedAt: text('watched_at').notNull(),
  title: text('title'),
  channel: text('channel'),
});

// Full video metadata from YouTube API
export const videos = sqliteTable('videos', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  channelId: text('channel_id').notNull(),
  channelTitle: text('channel_title'),
  publishedAt: text('published_at'),
  categoryId: text('category_id'),
  tags: text('tags', {mode: 'json'}),  // Store as JSON array

  // Content details
  duration: text('duration'),
  hasCaption: integer('has_caption', {mode: 'boolean'}),
  contentRating: text('content_rating', {mode: 'json'}),
  regionRestriction: text('region_restriction', {mode: 'json'}),

  // Statistics
  viewCount: integer('view_count').default(0),
  likeCount: integer('like_count').default(0),
  commentCount: integer('comment_count').default(0),

  // Status
  privacyStatus: text('privacy_status'),
  madeForKids: integer('made_for_kids', {mode: 'boolean'}),
  selfDeclaredMadeForKids: integer('self_declared_made_for_kids', {mode: 'boolean'}),
  embeddable: integer('embeddable', {mode: 'boolean'}),

  // Metadata
  fetchedAt: integer('fetched_at', {mode: 'timestamp'}).default(sql`(unixepoch())`),
});

// Channel information from YouTube API
export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),

  // Statistics
  subscriberCount: integer('subscriber_count').default(0),
  videoCount: integer('video_count').default(0),
  viewCount: integer('view_count').default(0),

  // Metadata
  publishedAt: text('published_at'),
  thumbnails: text('thumbnails', {mode: 'json'}),
  fetchedAt: integer('fetched_at', {mode: 'timestamp'}).default(sql`(unixepoch())`),
});

// Content classification results
export const classifications = sqliteTable('classifications', {
  videoId: text('video_id').primaryKey(),
  riskLevel: text('risk_level').notNull(),  // HIGH, MEDIUM, LOW
  riskScore: real('risk_score'),
  flagCount: integer('flag_count').default(0),
  warningCount: integer('warning_count').default(0),
  infoCount: integer('info_count').default(0),
  analyzedAt: integer('analyzed_at', {mode: 'timestamp'}).default(sql`(unixepoch())`),
});

// Individual classification flags/warnings
export const classificationFlags = sqliteTable('classification_flags', {
  id: integer('id').primaryKey({autoIncrement: true}),
  videoId: text('video_id').notNull(),
  flagType: text('flag_type').notNull(),  // flags, warnings, or info
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  message: text('message').notNull(),
  createdAt: integer('created_at', {mode: 'timestamp'}).default(sql`(unixepoch())`),
});

// Tags table - unique tags across all videos
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull().unique(),
  createdAt: integer('created_at', {mode: 'timestamp'}).default(sql`(unixepoch())`),
});

// Video-tags junction table (many-to-many)
export const videoTags = sqliteTable('video_tags', {
  id: integer('id').primaryKey({autoIncrement: true}),
  videoId: text('video_id').notNull(),
  tagId: integer('tag_id').notNull(),
  createdAt: integer('created_at', {mode: 'timestamp'}).default(sql`(unixepoch())`),
});

// AI analysis results
export const aiAnalysis = sqliteTable('ai_analysis', {
  videoId: text('video_id').primaryKey(),
  riskLevel: text('risk_level'),        // HIGH, MEDIUM, LOW
  summary: text('summary'),             // Brief 1-sentence video summary
  reasoning: text('reasoning'),         // AI's explanation
  model: text('model'),                 // gpt-4o-mini
  analyzedAt: integer('analyzed_at', {mode: 'timestamp'}).default(sql`(unixepoch())`),
});
