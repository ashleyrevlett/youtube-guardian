import Database from 'better-sqlite3';
import {drizzle} from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'path';
import {fileURLToPath} from 'url';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DB_PATH = path.join(PROJECT_ROOT, 'data', 'guardian.db');

// Create SQLite connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrency
sqlite.pragma('journal_mode = WAL');

// Create Drizzle instance
export const db = drizzle(sqlite, {schema});

// Export schema for use in queries
export * from './schema.js';
