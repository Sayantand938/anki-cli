// src/config/app.ts

// --- App Information ---
export const APP_NAME = 'anki-cli';

// --- Filenames ---
export const INPUT_JSON_FILENAME = 'input.json';
export const OUTPUT_JSON_FILENAME = 'output.json';
export const TRACKER_FILENAME = 'process-tracker.json';

// --- Timing Constants ---
export const ANKI_CONNECT_DELAY_MS = 500; // Standard delay for all Anki operations
export const RETRY_DELAY_MS = 1000;       // Standard delay for retries

// --- Server URLs ---
export const VIDEO_SERVER_URL = 'http://localhost:3000/play';