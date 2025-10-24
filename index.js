import 'dotenv/config';
import {google} from 'googleapis';
import path from 'path';
import {fileURLToPath} from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load service account key file path from .env
const SERVICE_ACCOUNT_KEY_FILE = process.env.SERVICE_ACCOUNT_KEY_FILE || path.join(__dirname, 'service-account-key.json');

/**
 * Authenticate using a service account
 * The service account will automatically be used if the key file exists
 */
async function authenticateServiceAccount() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
  });
  const authClient = await auth.getClient();
  return authClient;
}

/**
 * Get an authenticated YouTube API client
 */
async function getYouTubeClient() {
  const authClient = await authenticateServiceAccount();
  const youtube = google.youtube({
    version: 'v3',
    auth: authClient,
  });
  return youtube;
}

/**
 * Fetch information about a YouTube video by video ID
 * @param {string} videoId - The YouTube video ID
 */
async function getVideoInfo(videoId) {
  try {
    const youtube = await getYouTubeClient();
    const res = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: [videoId],
    });

    if (res.data.items && res.data.items.length > 0) {
      console.log('Video Information:', JSON.stringify(res.data.items[0], null, 2));
      return res.data.items[0];
    } else {
      console.log('No video found with the given ID.');
      return null;
    }
  } catch (error) {
    console.error('Error fetching video information:', error.message);
    throw error;
  }
}

// Example usage: Replace with your video ID
const VIDEO_ID = 'dQw4w9WgXcQ';
getVideoInfo(VIDEO_ID).catch(console.error);

