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
- **JUST COMPLETED**: Refactored file structure for better organization

### Recent Refactoring (Most Recent Session)

**Problem**: Files were disorganized in root directory
**Solution**: Restructured into clean hierarchy:

```
youtube-guardian/
├── src/
│   ├── cli/              # Command-line entry points
│   │   ├── analyze.js    # Main analysis orchestrator
│   │   └── parse-video-ids.js  # Parse watch history
│   └── lib/              # Core library modules
│       ├── video-analyzer.js      # YouTube API integration
│       ├── channel-analyzer.js    # Channel profiling
│       ├── content-classifier.js  # Content classification
│       └── report-generator.js    # Terminal reports
├── config/
│   └── blocklist.json    # User-customizable filters
├── data/                 # All data files (cached & generated)
├── classifiers/          # Future: ML classifier plugins
└── docs/                 # Documentation
```

**Key Changes Made**:
- Moved core modules to `src/lib/`
- Moved CLI scripts to `src/cli/`
- Updated all import paths to use relative imports
- Added `PROJECT_ROOT` constants in each file to reference project root
- Updated `package.json` scripts to point to new locations

### Bug Fixes Applied

1. **Channel Analyzer Error**: Fixed `TypeError: Cannot read properties of undefined (reading 'match')`
   - **Issue**: Some watch history entries don't have `titleUrl` field
   - **Fix**: Added null check in `src/lib/channel-analyzer.js:22`
   ```javascript
   if (!entry.titleUrl) continue;
   ```

## System Architecture

### Data Flow

```
1. User exports watch history from Google Takeout
   └─> Place at data/watch-history.json

2. npm run parse
   └─> src/cli/parse-video-ids.js
   └─> Filters ads (102) and games (92) from 282 entries
   └─> Outputs 88 videos to data/video-ids.json

3. npm run analyze
   └─> src/cli/analyze.js orchestrates 4 steps:
       ├─> video-analyzer.js (fetch from YouTube API)
       ├─> channel-analyzer.js (build profiles)
       ├─> content-classifier.js (risk assessment)
       └─> report-generator.js (terminal output)
```

### Key Components

#### 1. **video-analyzer.js**
- Authenticates with YouTube API using service account
- Fetches metadata in batches of 50 (API limit)
- Caches to `data/video-details.json`
- Rate limiting: 1 second between batches
- **Current data**: 87/88 videos cached (1 missing)

#### 2. **channel-analyzer.js**
- Builds channel profiles from video data
- Enriches with YouTube API channel data
- Tracks: videos watched, categories, tags, age restrictions
- Caches to `data/channel-profiles.json` and `data/channel-cache.json`
- **Current data**: 72 unique channels identified

#### 3. **content-classifier.js**
- Loads blocklist from `config/blocklist.json`
- Scans titles, descriptions, tags for keywords
- Checks age restrictions and content ratings
- Three-tier risk: HIGH (blocklist hits), MEDIUM (age restrictions), LOW (clean)
- Outputs to `data/analysis-results.json`

#### 4. **report-generator.js**
- Color-coded terminal output using ANSI codes
- Sections: Overview, Concerning Content, Top Channels, Categories, Recommendations
- Priority sorting: HIGH risk videos shown first

### Current Test Data

From user's actual watch history:
- **282 total entries** in watch-history.json
- **88 videos** (actual YouTube videos)
- **102 ads** (filtered out)
- **92 playables/games** (filtered out)
- **72 unique channels**

Sample channels: Solve For Why, Cursor, The Plant Slant, boneboy, Quiz shows, cooking channels, tech channels

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
1. **Missing video**: 1 of 88 videos not in cache (need to investigate why)
2. **Long API calls**: First run with 72 channels takes ~72 seconds (1 second rate limiting per channel)

### Limitations
1. Service account cannot access private videos
2. Classification is keyword-based (no AI/ML yet)
3. Age restrictions may not be comprehensive
4. No transcript analysis yet (high API quota cost)

## Future Enhancements (Architecture Ready)

The `classifiers/` directory is prepared for:
- **Transcript analysis**: Download captions, scan for profanity (200 quota units per video)
- **ML classification**: Vision API for thumbnail analysis
- **Comment analysis**: Scan viewer comments for warnings
- **Real-time monitoring**: Watch for new videos
- **Web dashboard**: React/Vue frontend

See `classifiers/README.md` for classifier plugin architecture.

## File Locations

### Code
- **CLI entry points**: `src/cli/`
- **Core libraries**: `src/lib/`
- **Old files to remove**: `index.js` (sample code, not used)

### Data
- **Input**: `data/watch-history.json` (user provides)
- **Parsed**: `data/video-ids.json` (88 videos)
- **Cached**: `data/video-details.json` (87 videos cached)
- **Channels**: `data/channel-profiles.json`, `data/channel-cache.json`
- **Results**: `data/analysis-results.json`

### Config
- **Blocklist**: `config/blocklist.json`
- **Service account**: `service-account-key.json` (in `.gitignore`)
- **Environment**: `.env` (optional, for custom paths)

## Commands

```bash
# Parse watch history (filters ads/games)
npm run parse

# Run full analysis (fetch API data, classify, report)
npm run analyze
```

## Important Notes

1. **All paths use PROJECT_ROOT**: Each file defines `PROJECT_ROOT = path.join(__dirname, '..', '..')` to reference project root regardless of file location

2. **ES Modules**: Project uses `"type": "module"` in package.json
   - All imports use `.js` extension
   - Top-level `await` supported
   - Use `fileURLToPath` to get `__dirname`

3. **Error handling**: Watch history entries may have missing fields (titleUrl, etc.) - always null check before accessing

4. **Rate limiting**: 1 second delay between API calls to avoid hitting rate limits

5. **Caching strategy**:
   - Video details cached indefinitely (metadata doesn't change)
   - Channel info cached with timestamps
   - Always check cache before making API calls

## Testing Status

- ✅ `npm run parse` - Working perfectly
- ⏳ `npm run analyze` - Started but interrupted (was fetching channel data)
- ❓ Full analysis run - Need to complete to verify entire pipeline

## Next Steps / TODOs

1. **Complete full test run** of `npm run analyze` to verify entire pipeline works
2. **Investigate missing video** (why is 1 of 88 videos not cached?)
3. **Update README.md** with new file structure
4. **Clean up old files**: Remove `index.js` or move to examples
5. **Optimize channel fetching**: Maybe batch channel requests instead of 1-per-second
6. **Add error recovery**: Handle API failures gracefully
7. **Consider adding**: Progress bars for long-running operations

## User's Goal

Monitor child's YouTube viewing habits by:
1. Identifying concerning content (violence, gore, racism, inappropriate language)
2. Getting summaries of what types of content is being watched
3. Tracking which channels are watched most
4. Future: Add ML-based classification for better detection

## Development Notes

- User prefers **clean, simple organization** (reason for recent refactor)
- Use **ES modules** (import/export) not CommonJS (require)
- Keep code **modular and extensible**
- Cache aggressively to minimize API costs
- Terminal output should be **clear and actionable**

## MCP Tools Used

- **DeepWiki**: Used to research YouTube API capabilities from `googleapis/google-api-nodejs-client` repo
- Learned about: videos.list, channels.list, captions (for future), content ratings, age restrictions

---

**Last Session Summary**: Refactored entire codebase from flat structure to organized `src/cli/` and `src/lib/` directories. Fixed channel analyzer bug. Updated all import paths. Ready for testing.
