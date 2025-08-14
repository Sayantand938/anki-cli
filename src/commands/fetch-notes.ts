// src/commands/fetch-notes.ts
import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

import { logger } from '../utils/logger.js';
import { ankiConnectRequest, delayedAnkiRequest } from '../anki/connector.js';
import type { AnkiNote, ProcessedNote } from '../anki/types.js';
import { DATA_DIR } from '../config/paths.js';
import { DECK_NAME } from '../config/anki.js';
import { INPUT_JSON_FILENAME } from '../config/app.js';
import { writeJsonFile } from '../utils/file-utils.js';
import { handleError } from '../utils/errorHandler.js';

// Fetch all note IDs from the deck
async function fetchNoteIds(deckName: string): Promise<number[]> {
  return delayedAnkiRequest('findNotes', { query: `deck:"${deckName}"` });
}

// Fetch detailed note info
async function fetchNoteDetails(noteIds: number[]): Promise<AnkiNote[]> {
  return delayedAnkiRequest('notesInfo', { notes: noteIds });
}

// Get output JSON file path (ensures directory)
async function getOutputFilePath(): Promise<string> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  return path.join(DATA_DIR, INPUT_JSON_FILENAME);
}

// Transform raw Anki notes into structured notes
function processNotes(notes: AnkiNote[]): ProcessedNote[] {
  return notes.map(note => {
    const { fields } = note;
    const answerIndex = fields.Answer?.value;
    const answerOptionKey = `OP${answerIndex}`;
    const correctAnswerText = fields[answerOptionKey]?.value ?? `Invalid Answer Index: '${answerIndex}'`;

    return {
      noteId: note.noteId,
      SL: fields.SL?.value ?? '',
      Question: fields.Question?.value ?? '',
      OP1: fields.OP1?.value ?? '',
      OP2: fields.OP2?.value ?? '',
      OP3: fields.OP3?.value ?? '',
      OP4: fields.OP4?.value ?? '',
      Answer: correctAnswerText,
      Extra: fields.Extra?.value ?? '',
      Tags: note.tags,
    };
  });
}

// Main logic to fetch, process, and store notes
async function runFetchNotes(deck: string): Promise<void> {
  const noteIds = await fetchNoteIds(deck);

  if (noteIds.length === 0) {
    logger.warn(`No notes found in deck "${deck}".`);
    return;
  }

  logger.success(`Found ${noteIds.length} note(s) in ${chalk.cyan(deck)}.`);

  const notesInfo = await fetchNoteDetails(noteIds);
  const processedNotes = processNotes(notesInfo);
  logger.success('Processed note details.');

  const outputFilePath = await getOutputFilePath();
  await writeJsonFile(outputFilePath, processedNotes);
  logger.success(`Notes saved to ${chalk.cyan(outputFilePath)}`);
}

// CLI command definition
const fetchNotesCmd = new Command('fetch-notes')
  .description(`Fetches and processes notes from Anki, saving them to ${chalk.cyan(INPUT_JSON_FILENAME)}.`)
  .option('-d, --deck <name>', 'Name of the Anki deck to fetch notes from', DECK_NAME)
  .action(async (options: { deck: string }) => {
    try {
      await runFetchNotes(options.deck);
    } catch (error) {
      handleError(error);
    }
  });

export default fetchNotesCmd;