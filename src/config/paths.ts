// src/config/paths.ts
import path from 'path';
import envPaths from 'env-paths';
import { APP_NAME } from './app.js';

const paths = envPaths(APP_NAME, { suffix: '' });

/**
 * The absolute path to your Anki executable.
 * Hardcoded for your specific Windows 11 setup as requested.
 */
export const ANKI_EXECUTABLE_PATH = 'C:\\Users\\sayantan\\AppData\\Local\\Programs\\Anki\\anki.exe';

/** The absolute path to your Anki user profile's media collection folder. */
export const ANKI_MEDIA_COLLECTION_PATH = 'D:\\AnkiData\\NOTES-1\\collection.media';

/** The directory to store all application data files. */
export const DATA_DIR = paths.data;

/** The directory to store sync server data. */
export const SYNC_BASE_DIRECTORY = path.join(DATA_DIR, 'sync-server');

/** Full path to Instructions directory */
export const INSTRUCTIONS_DIR = path.join(DATA_DIR, 'Instructions');

/** The absolute path to the root directory where video recordings are stored. */
export const RECORDINGS_BASE_PATH = 'D:\\Recordings';