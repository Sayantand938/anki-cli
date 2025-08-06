// src/config/anki.ts

// --- AnkiConnect Constants ---
export const ANKI_CONNECT_URL = 'http://localhost:8765';
export const DECK_NAME = '_Custom Study Session';

// --- AnkiConnect Actions ---
export const ANKI_CONNECT_ACTIONS = {
  ADD_TAGS: 'addTags',
  REPLACE_TAGS: 'replaceTags',
};

// --- Question Template Constants ---
export const QUESTION_BLOCK_QUESTION_MARKER = '<===================={QUESTION}====================>';
export const QUESTION_BLOCK_EXTRA_MARKER = '<===================={EXTRA}====================>';
export const QUESTION_TEMPLATE_HEADER = '```tags\n\n```\n\n';