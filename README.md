# YouTube Guardian 🛡️

A parental monitoring system for analyzing YouTube watch history and detecting potentially concerning content.

## Features

- 📊 **Watch History Analysis** - Parse and analyze YouTube watch history exports
- 🔍 **Content Classification** - Flag videos based on customizable blocklists
- 📺 **Channel Profiling** - Track viewing patterns by channel
- ⚠️ **Risk Assessment** - Categorize content as HIGH, MEDIUM, or LOW risk
- 📋 **Terminal Reports** - Color-coded, easy-to-read monitoring reports
- 💾 **Smart Caching** - Minimize API usage with intelligent caching

## Prerequisites

1. **Google Cloud Project** with YouTube Data API v3 enabled
2. **Service Account** with a downloaded JSON key file
3. **YouTube watch history** exported as JSON (from Google Takeout)

## Setup

1. Install dependencies:
```bash
nvm use
npm install
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

### Step 1: Parse Watch History
Extract video IDs from your watch history and filter out ads:
```bash
npm run parse
```

This creates `data/video-ids.json` with clean video data.

### Step 2: Analyze Content
Fetch video details from YouTube and generate a monitoring report:
```bash
npm run analyze
```

This will:
1. Fetch video metadata from YouTube API (with caching)
2. Analyze channel profiles and viewing patterns
3. Classify content based on your blocklist
4. Generate a color-coded terminal report

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

## Output Files

- `data/video-ids.json` - Parsed video IDs from watch history
- `data/video-details.json` - Full video metadata cache
- `data/channel-profiles.json` - Channel analysis and statistics
- `data/channel-cache.json` - Channel information cache
- `data/analysis-results.json` - Complete analysis report (JSON)

## Report Sections

The terminal report includes:

1. **Overview** - Total videos, channels, and risk summary
2. **Concerning Content** - HIGH and MEDIUM risk videos with warnings
3. **Top Channels** - Most watched channels with statistics
4. **Category Breakdown** - Content distribution by category
5. **Recommendations** - Actionable next steps

## Future Enhancements

The architecture supports adding:

- 🤖 **ML Classification** - AI-based content analysis
- 📝 **Transcript Analysis** - Analyze video captions for concerning language
- 💬 **Comment Analysis** - Review viewer comments
- 🌐 **Web Dashboard** - Interactive monitoring interface
- 📧 **Email Alerts** - Automated notifications for concerning content


## Notes

- The system uses **smart caching** to minimize YouTube API quota usage
- **Service account authentication** is used for server-to-server communication
- All data is stored **locally** - nothing is sent to external services
- The YouTube Data API has **quota limits** - caching helps manage this

## Todo

- [ ] Automate watch history export, for an auth'd user
- [ ] Deploy app to cloud
- [ ] Automate app to run on cron
- [ ] Change terminal export to emailed report
- [ ] Add ML classifiers to review transcript, thumbnails, sentiment for deeper analysis of video content
