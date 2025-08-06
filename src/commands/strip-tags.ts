// // src/commands/strip-tags.ts
// import { Command } from 'commander';
// import chalk from 'chalk';
// import inquirer from 'inquirer';

// import { logger } from '../utils/logger.js';
// import { ankiConnectRequest } from '../anki/connector.js';
// import { DECK_NAME } from '../config/anki.js';
// import { handleError } from '../utils/errorHandler.js';
// import type { AnkiNote } from '../anki/types.js';
// import { delay } from '../utils/timers.js';
// import { createSpinner } from '../utils/spinner.js';
// import { formatProgress } from '../utils/formatters.js';
// import { ANKI_CONNECT_DELAY_MS } from '../config/app.js';

// interface TagReplacement {
//   noteId: number;
//   from: string;
//   to: string;
// }

// const SUBJECT_PREFIXES = ['GK::', 'MATH::', 'ENG::', 'GI::'];

// // --- Delay-wrapped Anki Request ---
// async function delayedAnkiRequest<T>(action: string, params: object): Promise<T> {
//   await delay(ANKI_CONNECT_DELAY_MS); // Standard 1-second delay
//   return ankiConnectRequest(action, params);
// }

// // --- Fetch Notes ---
// async function fetchNotesFromDeck(): Promise<AnkiNote[]> {
//   logger.info(`Fetching notes from deck: ${chalk.cyan(DECK_NAME)}...`);
//   await delay(ANKI_CONNECT_DELAY_MS); // Delay before first Anki call

//   const noteIds: number[] = await delayedAnkiRequest('findNotes', {
//     query: `deck:"${DECK_NAME}"`,
//   });

//   if (noteIds.length === 0) {
//     logger.warn(`No notes found in deck "${DECK_NAME}".`);
//     return [];
//   }

//   logger.success(`Found ${chalk.green(noteIds.length)} note(s). Analyzing tags...`);
//   await delay(ANKI_CONNECT_DELAY_MS);

//   return delayedAnkiRequest('notesInfo', { notes: noteIds });
// }

// // --- Prepare Tag Replacements ---
// function getSubjectTagReplacements(notes: AnkiNote[]): TagReplacement[] {
//   const updates: TagReplacement[] = [];

//   for (const note of notes) {
//     for (const tag of note.tags) {
//       const prefix = SUBJECT_PREFIXES.find(p => tag.startsWith(p));
//       if (prefix) {
//         updates.push({
//           noteId: note.noteId,
//           from: tag,
//           to: prefix.slice(0, -2), // GK:: => GK
//         });
//       }
//     }
//   }

//   return updates;
// }

// // --- Preview Changes ---
// function previewReplacements(updates: TagReplacement[]): void {
//   logger.log('---');
//   logger.info(chalk.bold.cyan('--- PREVIEW OF CHANGES ---'));
//   updates.forEach(update => {
//     console.log(
//       `Note ID ${chalk.yellow(update.noteId)}: Replace tag '${chalk.red(update.from)}' with '${chalk.green(update.to)}'`
//     );
//   });
//   logger.log('---');
// }

// // --- Confirm and Apply ---
// async function confirmAndApplyReplacements(updates: TagReplacement[]): Promise<void> {
//   const { proceed } = await inquirer.prompt([
//     {
//       type: 'confirm',
//       name: 'proceed',
//       message: `Apply these ${chalk.yellow(updates.length)} tag replacements to Anki?`,
//       default: false,
//     },
//   ]);

//   if (!proceed) {
//     logger.warn('Update cancelled by user. No changes were made.');
//     return;
//   }

//   logger.info(chalk.dim('Pausing for a moment before starting the update...'));
//   await delay(ANKI_CONNECT_DELAY_MS);

//   let successCount = 0;
//   const spinner = createSpinner('Starting update...');
//   spinner.start();

//   for (let i = 0; i < updates.length; i++) {
//     const update = updates[i];
//     const progress = formatProgress(i + 1, updates.length);
//     spinner.setText(`${progress} Replacing tag for Note ID ${chalk.yellow(update.noteId)}...`);

//     try {
//       await delayedAnkiRequest('replaceTags', {
//         notes: [update.noteId],
//         tag_to_replace: update.from,
//         replace_with_tag: update.to,
//       });
//       successCount++;
//     } catch (err: any) {
//       spinner.stop();
//       logger.error(`Failed to update Note ID ${update.noteId}: ${err.message}`);
//       spinner.start();
//     }

//     await delay(ANKI_CONNECT_DELAY_MS); // Standard delay after each update
//   }

//   spinner.stop();
//   logger.success(`Update complete. Successfully applied ${chalk.green(successCount)}/${updates.length} tag replacements.`);

//   if (successCount < updates.length) {
//     logger.error(`${updates.length - successCount} replacements failed. Check logs above.`);
//   }
// }

// // --- CLI Command ---
// const stripTagsCmd = new Command('strip-tags')
//   .description('Replaces subject-topic tags (e.g., "GK::History") with just the subject tag (e.g., "GK").')
//   .action(async () => {
//     try {
//       const notes = await fetchNotesFromDeck();
//       if (notes.length === 0) return;

//       const updates = getSubjectTagReplacements(notes);
//       if (updates.length === 0) {
//         logger.info('No notes with subject-topic tags found to update.');
//         return;
//       }

//       previewReplacements(updates);
//       await confirmAndApplyReplacements(updates);
//     } catch (error) {
//       handleError(error);
//     }
//   });

// export default stripTagsCmd;


// src/commands/strip-tags.ts
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';

import { logger } from '../utils/logger.js';
import { delayedAnkiRequest } from '../anki/connector.js';
import { DECK_NAME } from '../config/anki.js';
import { handleError } from '../utils/errorHandler.js';
import type { AnkiNote } from '../anki/types.js';
import { processInBatches } from '../utils/batchProcessor.js';

interface TagReplacement {
  noteId: number;
  from: string;
  to: string;
}

const SUBJECT_PREFIXES = ['GK::', 'MATH::', 'ENG::', 'GI::'];

// --- Fetch Notes ---
async function fetchNotesFromDeck(): Promise<AnkiNote[]> {
  logger.info(`Fetching notes from deck: ${chalk.cyan(DECK_NAME)}...`);
  const noteIds: number[] = await delayedAnkiRequest('findNotes', {
    query: `deck:"${DECK_NAME}"`,
  });

  if (noteIds.length === 0) {
    logger.warn(`No notes found in deck "${DECK_NAME}".`);
    return [];
  }

  logger.success(`Found ${chalk.green(noteIds.length)} note(s). Analyzing tags...`);
  return delayedAnkiRequest('notesInfo', { notes: noteIds });
}

// --- Prepare Tag Replacements ---
function getSubjectTagReplacements(notes: AnkiNote[]): TagReplacement[] {
  const updates: TagReplacement[] = [];

  for (const note of notes) {
    for (const tag of note.tags) {
      const prefix = SUBJECT_PREFIXES.find(p => tag.startsWith(p));
      if (prefix) {
        updates.push({
          noteId: note.noteId,
          from: tag,
          to: prefix.slice(0, -2), // GK:: => GK
        });
      }
    }
  }

  return updates;
}

// --- Preview Changes ---
function previewReplacements(updates: TagReplacement[]): void {
  logger.log('---');
  logger.info(chalk.bold.cyan('--- PREVIEW OF CHANGES ---'));
  updates.forEach(update => {
    console.log(
      `Note ID ${chalk.yellow(update.noteId)}: Replace tag '${chalk.red(update.from)}' with '${chalk.green(update.to)}'`,
    );
  });
  logger.log('---');
}

// --- Apply Single Replacement ---
async function applyTagReplacement(update: TagReplacement): Promise<boolean> {
  try {
    await delayedAnkiRequest('replaceTags', {
      notes: [update.noteId],
      tag_to_replace: update.from,
      replace_with_tag: update.to,
    });
    return true;
  } catch (err: any) {
    logger.error(`Failed to update Note ID ${update.noteId}: ${err.message}`);
    return false;
  }
}

// --- Confirm and Apply ---
async function confirmAndApplyReplacements(updates: TagReplacement[]): Promise<void> {
  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: `Apply these ${chalk.yellow(updates.length)} tag replacements to Anki?`,
      default: false,
    },
  ]);

  if (!proceed) {
    logger.warn('Update cancelled by user. No changes were made.');
    return;
  }

  const { successCount, totalCount } = await processInBatches({
    items: updates,
    processFn: applyTagReplacement,
    spinnerMessage: 'Applying tag replacements',
  });

  logger.success(`Update complete. Successfully applied ${chalk.green(successCount)}/${totalCount} tag replacements.`);
  if (successCount < totalCount) {
    logger.error(`${totalCount - successCount} replacements failed. Check logs above.`);
  }
}

// --- CLI Command ---
const stripTagsCmd = new Command('strip-tags')
  .description('Replaces subject-topic tags (e.g., "GK::History") with just the subject tag (e.g., "GK").')
  .action(async () => {
    try {
      const notes = await fetchNotesFromDeck();
      if (notes.length === 0) return;

      const updates = getSubjectTagReplacements(notes);
      if (updates.length === 0) {
        logger.info('No notes with subject-topic tags found to update.');
        return;
      }

      previewReplacements(updates);
      await confirmAndApplyReplacements(updates);
    } catch (error) {
      handleError(error);
    }
  });

export default stripTagsCmd;