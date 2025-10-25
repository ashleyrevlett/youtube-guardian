# YouTube Guardian 🛡️

A parental monitoring system for analyzing YouTube watch history and detecting potentially concerning content.

## Features

- 📊 **Watch History Analysis** - Parse and analyze YouTube watch history exports
- 🔍 **Content Classification** - Flag videos based on customizable blocklists and age ratings (MPAA, BBFC)
- 📺 **Channel Profiling** - Track viewing patterns by channel
- ⚠️ **Risk Assessment** - Categorize content as HIGH, MEDIUM, or LOW risk
- 📋 **Terminal Reports** - Color-coded, easy-to-read monitoring reports
- 💾 **Smart Caching** - SQLite database with intelligent caching to minimize API usage
- 🗄️ **Database Storage** - Drizzle ORM with SQLite for efficient data management
- 🎬 **Video Downloads** - Download actual video files using yt-dlp for offline analysis
- 📝 **Caption Downloads** - Extract subtitles/transcripts for text-based content review

## Prerequisites

1. **Google Cloud Project** with YouTube Data API v3 enabled
2. **Service Account** with a downloaded JSON key file
3. **YouTube watch history** exported as JSON (from Google Takeout)
4. yt-dlp and its dependencies installed and available via terminal

## Setup

1. Install dependencies:
```bash
nvm use
npm install
brew install ffmpeg yt-dlp
```

2. Set up Google Cloud:
   - Go to Google Developers Console
   - Set up a Project and add a service account with a key
   - Download the service account JSON file, name it `service-account-key.json`
   - Enable the YouTube API for the project

3. Create a `.env` file (optional):
```env
SERVICE_ACCOUNT_KEY_FILE=/path/to/your/service-account-key.json
```

4. Place your watch history file at:
```
data/watch-history.json
```

5. Customize the blocklist (optional):
```
config/blocklist.json
```

## Usage

### Quick Start (One Command)
Run everything in one shot:
```bash
npm start
```

This will:
1. Apply database migrations (`db:push`)
2. Parse watch history into database (`parse`)
3. Run full analysis and generate report (`analyze`)

### Individual Commands

If you prefer to run steps separately:

**Parse Watch History**
```bash
npm run parse
```
Extracts video IDs from your watch history, filters out ads and games, and stores them in the SQLite database.

**Analyze Content**
```bash
npm run analyze
```
1. Fetches video metadata from YouTube API (with smart caching in database)
2. Analyzes channel profiles and viewing patterns
3. Classifies content based on your blocklist and age ratings (MPAA, BBFC)
4. Generates a color-coded terminal report
5. Exports findings to `data/analysis-results.json`

**Download Videos (Optional)**
```bash
npm run download
```
Downloads videos (MP4, lowest quality) to `data/videos/` using yt-dlp for offline AI analysis.

**Download Captions (Optional)**
```bash
npm run download-captions
```
Downloads English captions/subtitles (SRT format) to `data/captions/` for text analysis.

**Cleanup**
```bash
npm run cleanup-videos
```
Deletes downloaded videos to free disk space.

### Database Operations

**Browse Database (Web UI)**
```bash
npx drizzle-kit studio
```
Opens a web interface to explore your SQLite database tables and data.

**Apply Migrations**
```bash
npm run db:push
```
Applies database schema migrations (automatically run by `npm start`).

**Generate Migrations (Developers Only)**
```bash
npm run db:generate
```
After modifying `src/db/schema.js`, run this to create new migration files.

## Configuration

### Blocklist (`config/blocklist.json`)

Add keywords, channel IDs, or category IDs to flag content:

```json
{
  "keywords": [
    "violent",
    "gore",
    "inappropriate"
  ],
  "channels": [
    "UCxxxxxxxxxxxxxxxxx"
  ],
  "categories": [
    "39"
  ]
}
```

### YouTube Category IDs

Common categories:
- `10` - Music
- `20` - Gaming
- `24` - Entertainment
- `27` - Education
- `39` - Horror


## Report Sections

The terminal report includes:

1. **Overview** - Total videos, channels, and risk summary
2. **Concerning Content** - HIGH and MEDIUM risk videos with warnings
3. **Top Channels** - Most watched channels with statistics
4. **Category Breakdown** - Content distribution by category
5. **Recommendations** - Actionable next steps

## Workflow

```bash
npm run parse              # Parse watch history
npm run analyze            # Analyze & report
npm run download           # (Optional) Download videos
npm run download-captions  # (Optional) Download captions
npm run cleanup-videos     # Clean up downloads
```

## Future Enhancements

The architecture supports adding:

- 🤖 **AI Classification** - Analyze videos and transcripts using LLMs (OpenAI, Claude, Gemini, local models)
- 📸 **Thumbnail Analysis** - Visual content screening using computer vision
- 💬 **Comment Analysis** - Review viewer comments for warning signs
- 🌐 **Web Dashboard** - Interactive monitoring interface
- 📧 **Email Alerts** - Automated notifications for concerning content
- 📈 **Trend Analysis** - Track viewing patterns over time


## Notes

- The system uses **SQLite database** with smart caching to minimize YouTube API quota usage
- **Service account authentication** is used for server-to-server communication
- All data is stored **locally** - nothing is sent to external services except YouTube API calls
- The YouTube Data API has **quota limits** (10,000 units/day) - database caching helps manage this
- Database is excluded from git via `.gitignore` - each user maintains their own local database

### Storage

- Database: ~1-5 MB
- Videos: ~10-50 MB each (lowest quality)
- Captions: ~5-20 KB each (text)

## Todo

- [ ] Automate watch history export, for an auth'd user
- [ ] Deploy app to cloud
- [ ] Automate app to run on cron
- [ ] Change terminal export to emailed report
- [ ] Add ML classifiers to review transcript, thumbnails, sentiment for deeper analysis of video content
