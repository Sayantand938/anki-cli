// src/commands/sl-gen.ts
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';

import { logger } from '../utils/logger.js';
import { delayedAnkiRequest } from '../anki/connector.js';
import { DECK_NAME } from '../config/anki.js';
import { handleError } from '../utils/errorHandler.js';
import type { AnkiNote, SlUpdate } from '../anki/types.js';
import { processInBatches } from '../utils/batchProcessor.js';

// --- Helpers ---

function generateSourceParts(tag: string): string | null {
  const parts = tag.split('::');
  if (parts.length < 3) return null;

  const exam = parts[0]?.toUpperCase();
  let tierRaw = parts[1]?.toLowerCase();
  const set = parts[2];

  let tier: string;
  if (tierRaw === 'prelims') tier = 'PRE';
  else if (tierRaw === 'mains') tier = 'MAINS';
  else tier = tierRaw?.substring(0, 3)?.toUpperCase() || '';

  if (!exam || !tier || !set) return null;

  return `${exam}-${tier}-${set}`;
}

function generateSubjectPart(tag: string): string | null {
  const parts = tag.split('::');
  const subject = parts[0]?.toUpperCase();
  return subject || null;
}

async function fetchNotesFromDeck(): Promise<AnkiNote[]> {
  logger.info(`Fetching notes from deck: ${chalk.cyan(DECK_NAME)}...`);
  const noteIds: number[] = await delayedAnkiRequest('findNotes', { query: `deck:"${DECK_NAME}"` });

  if (noteIds.length === 0) {
    logger.warn(`No notes found in deck "${DECK_NAME}".`);
    return [];
  }

  logger.success(`Found ${chalk.green(noteIds.length)} note(s). Processing...`);
  const notesInfo: AnkiNote[] = await delayedAnkiRequest('notesInfo', { notes: noteIds });
  return notesInfo;
}

function buildSlUpdates(notesInfo: AnkiNote[]): SlUpdate[] {
  const updates: SlUpdate[] = [];
  const subjectCounters: Record<string, number> = {};

  for (const note of notesInfo) {
    let sourceTag: string | undefined;
    let sourceParts: string | null = null;

    for (const tag of note.tags) {
      const parts = generateSourceParts(tag);
      if (parts) {
        sourceTag = tag;
        sourceParts = parts;
        break;
      }
    }

    const subjectTag = note.tags.find(t => t.includes('::') && t !== sourceTag);

    if (!sourceTag || !subjectTag) {
      logger.warn(`Skipping Note ID ${chalk.yellow(note.noteId)}: Missing required source or subject tags. Tags: [${note.tags.join(', ')}]`);
      continue;
    }

    const subjectPart = generateSubjectPart(subjectTag);
    if (!sourceParts || !subjectPart) {
      logger.warn(`Skipping Note ID ${chalk.yellow(note.noteId)}: Could not parse tags [${sourceTag}, ${subjectTag}].`);
      continue;
    }

    if (!subjectCounters[subjectPart]) {
      subjectCounters[subjectPart] = 1;
    }

    const count = subjectCounters[subjectPart]++;
    const serial = String(count).padStart(3, '0');
    const newSl = `${sourceParts}-${subjectPart}-${serial}`;
    updates.push({ noteId: note.noteId, newSl });
  }

  return updates;
}

function previewUpdates(updates: SlUpdate[]) {
  logger.log('--------------------');
  logger.info(chalk.bold.cyan('--- PREVIEW OF CHANGES ---'));
  for (const update of updates) {
    console.log(`Note ID: ${chalk.yellow(update.noteId)}\t=> New SL: ${chalk.green(update.newSl)}`);
  }
  logger.log('--------------------');
}

async function applySingleSlUpdate(update: SlUpdate): Promise<boolean> {
  try {
    await delayedAnkiRequest('updateNoteFields', {
      note: { id: update.noteId, fields: { SL: update.newSl } },
    });
    return true;
  } catch (err: any) {
    logger.error(`Failed to update Note ID ${update.noteId}: ${err.message}`);
    return false;
  }
}

async function confirmAndApplyUpdates(updates: SlUpdate[]) {
  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: `Apply these ${chalk.yellow(updates.length)} SL changes to Anki?`,
      default: false,
    },
  ]);

  if (!proceed) {
    logger.warn('Update cancelled by user. No changes were made.');
    return;
  }

  const { successCount, totalCount } = await processInBatches({
    items: updates,
    processFn: applySingleSlUpdate,
    spinnerMessage: 'Applying SL changes',
  });

  logger.success(`Update complete. Successfully updated ${chalk.green(successCount)}/${totalCount} notes.`);
  if (successCount < totalCount) {
    logger.error(`${totalCount - successCount} notes failed to update. Check logs above.`);
  }
}

// --- CLI Command ---
const slGenCmd = new Command('sl-gen')
  .description('Generates and updates the SL field for notes based on their tags after user confirmation.')
  .action(async () => {
    try {
      const notesInfo = await fetchNotesFromDeck();
      if (notesInfo.length === 0) return;

      const updates = buildSlUpdates(notesInfo);
      if (updates.length === 0) {
        logger.warn('Processing finished, but no notes were eligible for SL generation.');
        return;
      }

      previewUpdates(updates);
      await confirmAndApplyUpdates(updates);
    } catch (error) {
      handleError(error);
    }
  });

export default slGenCmd;