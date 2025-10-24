# YouTube Guardian - Context for Claude

## Project Overview

YouTube Guardian is a **parental monitoring system** that analyzes YouTube watch history to detect potentially concerning content for children. The system runs locally using Google's YouTube Data API v3 with service account authentication.

## Current Status

### ✅ Completed
- Full implementation of video analysis pipeline
- Content classification with 3-tier risk assessment (HIGH/MEDIUM/LOW)
- Channel profiling and reputation tracking
- Terminal-based reporting with color-coded output
- Smart caching to minimize API quota usage
- Refactored file structure for better organization
- **JUST COMPLETED**: Migrated from JSON storage to SQLite with Drizzle ORM

### Recent Migration to SQLite (Most Recent Session)

**Problem**: JSON files were used for all storage, making data queries and aggregations difficult
**Solution**: Migrated to SQLite database with Drizzle ORM

**Database Schema**:
- `watch_history` - Parsed watch history entries (videoId, title, watchedAt)
- `videos` - Full video metadata from YouTube API (title, description, stats, etc.)
- `channels` - Channel metadata and statistics (subscribers, videos, description)
- `classifications` - Risk assessment results (riskLevel, flagCount, warningCount)
- `classification_flags` - Individual flags/warnings/info for each video

**Key Changes Made**:
- Installed: `drizzle-orm`, `better-sqlite3`, `drizzle-kit`
- Created database schema at `src/db/schema.js`
- Created database connection at `src/db/index.js`
- Updated all modules to use database instead of JSON:
  - `parse-video-ids.js` → stores to `watch_history` table
  - `video-analyzer.js` → caches in `videos` table
  - `channel-analyzer.js` → uses SQL aggregation, stores in `channels` table
  - `content-classifier.js` → stores in `classifications` and `classification_flags` tables
  - `report-generator.js` → queries database with SQL joins
- Maintained input/output format: still reads `watch-history.json`, still exports `analysis-results.json`

**Benefits**:
- Efficient SQL queries with aggregations and joins
- Proper data relationships with foreign keys
- WAL mode enabled for better concurrency
- No need to load entire datasets into memory
- Foundation for future features (time-series analysis, trends, etc.)

### Bug Fixes Applied

1. **Channel Analyzer Error** (Previous session): Fixed `TypeError: Cannot read properties of undefined (reading 'match')`
   - **Issue**: Some watch history entries don't have `titleUrl` field
   - **Fix**: Added null check in parse-video-ids.js
   ```javascript
   if (!entry.titleUrl) continue;
   ```

2. **Drizzle Config Error** (This session): Missing 'dialect' parameter
   - **Issue**: Drizzle config used old `driver: 'better-sqlite3'` syntax
   - **Fix**: Changed to `dialect: 'sqlite'` in drizzle.config.js

## System Architecture

### Data Flow

```
1. User exports watch history from Google Takeout
   └─> Place at data/watch-history.json

2. npm run parse
   └─> src/cli/parse-video-ids.js
   └─> Filters ads and games from watch history
   └─> Stores to `watch_history` table in SQLite database

3. npm run analyze
   └─> src/cli/analyze.js orchestrates 4 steps:
       ├─> video-analyzer.js (fetch from YouTube API, cache in `videos` table)
       ├─> channel-analyzer.js (SQL aggregation, cache in `channels` table)
       ├─> content-classifier.js (risk assessment, store in `classifications` table)
       └─> report-generator.js (query database, generate terminal + JSON output)
```

### Key Components

#### 1. **src/db/schema.js** & **src/db/index.js**
- Defines database schema using Drizzle ORM
- 5 tables: watch_history, videos, channels, classifications, classification_flags
- SQLite connection with WAL mode enabled
- Foreign key relationships between tables

#### 2. **video-analyzer.js**
- Authenticates with YouTube API using service account
- Fetches metadata in batches of 50 (API limit)
- Caches to `videos` table in SQLite database
- Rate limiting: 1 second between batches
- **Smart caching**: Only fetches videos not already in database

#### 3. **channel-analyzer.js**
- Uses SQL aggregation to build channel statistics from `videos` table
- Enriches with YouTube API channel data
- Tracks: videos watched, avg views, made-for-kids ratio, age restrictions
- Caches to `channels` table in SQLite database
- **Efficient queries**: Leverages SQL GROUP BY for aggregations

#### 4. **content-classifier.js**
- Loads blocklist from `config/blocklist.json`
- Scans titles, descriptions, tags for keywords
- Checks age restrictions and content ratings
- Three-tier risk: HIGH (blocklist hits), MEDIUM (age restrictions), LOW (clean)
- Stores results in `classifications` and `classification_flags` tables
- Also exports to `data/analysis-results.json` for backward compatibility

#### 5. **report-generator.js**
- Color-coded terminal output using ANSI codes
- Queries database using SQL joins for efficiency
- Sections: Overview, Concerning Content, Top Channels, Categories, Recommendations
- Priority sorting: HIGH risk videos shown first
- Exports JSON report to `data/analysis-results.json`

### Current Test Data (Latest Run)

From user's actual watch history:
- **103 total entries** in watch-history.json
- **34 videos** (actual YouTube videos stored in database)
- **42 ads** (filtered out)
- **27 games** (filtered out)
- **27 unique channels** cached in database

**Risk Assessment Results**:
- 2 HIGH risk videos (keyword "graphic" detected)
- 0 MEDIUM risk videos
- 32 LOW risk videos

Sample channels: The Quiz Show (7 videos), Quiz Cat (2 videos), Cursor, Maangchi, Splattercatgaming, fastQUIZ

## Authentication Setup

**Service Account** authentication (not OAuth):
- Key file: `service-account-key.json` in project root
- Scopes: `https://www.googleapis.com/auth/youtube.readonly`
- Project ID: `youtube-guardian-476118`
- Environment variable: `SERVICE_ACCOUNT_KEY_FILE` (optional override)

## API Usage & Quotas

YouTube Data API v3 daily quota: **10,000 units**

Current usage pattern:
- `videos.list`: 1 unit per request (50 videos max)
- `channels.list`: 1 unit per request
- For 88 videos + 72 channels: ~14 units total
- **With caching**: Subsequent runs = 0 units

## Configuration

### config/blocklist.json

```json
{
  "keywords": ["violent", "gore", "blood", "graphic", "nsfw", "inappropriate"],
  "channels": [],
  "categories": []
}
```

User can customize to flag specific:
- Keywords in titles/descriptions/tags
- Channel IDs
- YouTube category IDs (e.g., "39" = Horror)

## Known Issues & Limitations

### Current Issues
None! Full pipeline tested and working perfectly.

### Limitations
1. Service account cannot access private/deleted videos
2. Classification is keyword-based (no AI/ML yet)
3. Age restrictions may not be comprehensive (relies on YouTube's metadata)
4. No transcript analysis yet (high API quota cost - 200 units per video)
5. No historical trending analysis yet (future enhancement)

## Future Enhancements (Architecture Ready)

With SQLite in place, the system is now ready for:
- **Transcript analysis**: Download captions, scan for profanity (200 quota units per video)
- **ML classification**: Vision API for thumbnail analysis
- **Comment analysis**: Scan viewer comments for warnings
- **Historical trends**: Track risk levels over time, identify new concerning channels
- **Time-series analysis**: When does child watch most? Which days/times?
- **Watch pattern detection**: Binge-watching detection, rabbit hole detection
- **Real-time monitoring**: Watch for new videos from known channels
- **Web dashboard**: React/Vue frontend with charts and graphs
- **Parental alerts**: Email/SMS notifications for HIGH risk content

The `classifiers/` directory is prepared for plugin-based classifier architecture.

## File Locations

### Code
- **CLI entry points**: `src/cli/analyze.js`, `src/cli/parse-video-ids.js`
- **Core libraries**: `src/lib/` (video-analyzer, channel-analyzer, content-classifier, report-generator)
- **Database**: `src/db/schema.js` (schema definitions), `src/db/index.js` (connection)
- **Old files**: `index.js` (sample OAuth code, not used in main flow)

### Data
- **Input**: `data/watch-history.json` (user provides from Google Takeout)
- **Database**: `data/guardian.db` (SQLite database with all cached data)
- **Output**: `data/analysis-results.json` (JSON report for backward compatibility)
- **Legacy JSON files** (can be deleted): `video-ids.json`, `video-details.json`, `channel-profiles.json`, `channel-cache.json`

### Config
- **Blocklist**: `config/blocklist.json` (user-customizable keywords, channels, categories)
- **Service account**: `service-account-key.json` (in `.gitignore`)
- **Drizzle**: `drizzle.config.js` (Drizzle ORM configuration)
- **Environment**: `.env` (optional, for custom paths)

## Commands

```bash
# First-time setup (or after pulling new migrations)
npm start                 # Runs db:push → parse → analyze

# Individual commands
npm run parse             # Parse watch history into database (filters ads/games)
npm run analyze           # Run full analysis (fetch API data, classify, report)

# Database operations
npm run db:push           # Apply migrations to database
npm run db:generate       # (Developers only) Generate new migration after schema changes
npx drizzle-kit studio    # Visual database browser (optional)
```

## Important Notes

1. **All paths use PROJECT_ROOT**: Each file defines `PROJECT_ROOT = path.join(__dirname, '..', '..')` to reference project root regardless of file location

2. **ES Modules**: Project uses `"type": "module"` in package.json
   - All imports use `.js` extension
   - Top-level `await` supported
   - Use `fileURLToPath` to get `__dirname`

3. **Error handling**: Watch history entries may have missing fields (titleUrl, etc.) - always null check before accessing

4. **Rate limiting**: 1 second delay between API calls to avoid hitting rate limits

5. **Caching strategy** (now database-backed):
   - Video details cached in `videos` table (metadata doesn't change)
   - Channel info cached in `channels` table
   - Classifications stored in `classifications` table with timestamps
   - Always check database before making API calls

6. **Database benefits**:
   - All data persisted in SQLite with proper relationships
   - Efficient querying with SQL joins and aggregations
   - Foundation for time-series analysis and trend tracking
   - WAL mode for better concurrency

7. **Schema changes** (for developers):
   - After modifying `src/db/schema.js`, run `npm run db:generate` to create new migration files
   - Commit the generated migration files to the repo
   - Users will automatically get schema updates when they run `npm start` (which includes `db:push`)

## Testing Status

- ✅ `npm run parse` - Working perfectly (stores to database)
- ✅ `npm run analyze` - Full pipeline tested and working
- ✅ Database verified - 34 videos, 27 channels, 34 classifications
- ✅ JSON export working - analysis-results.json generated correctly

## Next Steps / TODOs

1. **Clean up legacy JSON files** in `data/` (video-ids.json, video-details.json, channel-profiles.json, channel-cache.json) - no longer needed
2. **Update README.md** with SQLite/Drizzle information
3. **Add database migrations** using Drizzle Kit for schema versioning
4. **Consider adding**: Progress bars for long-running operations
5. **Future**: Add time-series queries to track viewing patterns over time
6. **Future**: Build web dashboard to visualize data from SQLite

## User's Goal

Monitor child's YouTube viewing habits by:
1. Identifying concerning content (violence, gore, racism, inappropriate language)
2. Getting summaries of what types of content is being watched
3. Tracking which channels are watched most
4. Future: Add ML-based classification for better detection

## Development Notes

- User prefers **clean, simple organization** (reason for recent refactor)
- User prefers **DRY architecture** but without excessive abstraction
- Use **ES modules** (import/export) not CommonJS (require)
- Keep code **modular and extensible**
- Cache aggressively to minimize API costs
- Terminal output should be **clear and actionable**

## MCP Tools Used

- **DeepWiki**: Used to research YouTube API capabilities from `googleapis/google-api-nodejs-client` repo
- Learned about: videos.list, channels.list, captions (for future), content ratings, age restrictions

---

**Last Session Summary**:
- **Previous session**: Refactored codebase into organized `src/cli/` and `src/lib/` structure
- **This session**: Migrated from JSON storage to SQLite with Drizzle ORM
  - Created 5-table database schema with proper relationships
  - Updated all modules to use database instead of JSON files
  - Maintained backward compatibility (reads watch-history.json, exports analysis-results.json)
  - Full pipeline tested successfully with 34 videos, 27 channels, 2 HIGH risk detections
  - System is production-ready with robust database backend
