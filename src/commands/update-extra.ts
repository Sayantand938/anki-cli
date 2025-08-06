// // src/commands/update-extra.ts
// import { Command } from 'commander';
// import chalk from 'chalk';
// import { globby } from 'globby';
// import fs from 'fs/promises';
// import path from 'path';
// import { delay } from '../utils/timers.js';

// import { logger } from '../utils/logger.js';
// import { ankiConnectRequest } from '../anki/connector.js';
// import type { NoteUpdate } from '../anki/types.js';
// import { handleError } from '../utils/errorHandler.js';
// import { readJsonArray } from '../utils/file-utils.js';
// import { formatProgress } from '../utils/formatters.js';
// import { DATA_DIR } from '../config/paths.js';
// import { createSpinner } from '../utils/spinner.js';
// import { ANKI_CONNECT_DELAY_MS } from '../config/app.js';

// async function readUpdateFile(filePath: string): Promise<NoteUpdate[]> {
//   const records = await readJsonArray<any>(filePath);
//   return records
//     .filter(r => typeof r.noteId === 'number' && typeof r.Extra === 'string')
//     .map(r => ({ noteId: r.noteId, Extra: r.Extra }));
// }

// async function updateNoteExtra(note: NoteUpdate): Promise<boolean> {
//   try {
//     await delay(ANKI_CONNECT_DELAY_MS); // ✅ delay before Anki API call
//     await ankiConnectRequest('updateNoteFields', {
//       note: { id: note.noteId, fields: { Extra: note.Extra } },
//     });
//     return true;
//   } catch {
//     return false;
//   }
// }

// const updateExtraCmd = new Command('update-extra')
//   .description(`Processes 'output-part-*.json' files to update the "Extra" field in Anki notes, deleting each file after completion.`)
//   .action(async () => {
//     try {
//       const pattern = path.join(DATA_DIR, 'output-part-*.json').replace(/\\/g, '/');
//       const partFiles = await globby(pattern, { absolute: true });

//       if (partFiles.length === 0) {
//         logger.warn(`No 'output-part-*.json' files found in ${chalk.dim(DATA_DIR)}.`);
//         return;
//       }

//       logger.info(`Found ${chalk.green(partFiles.length)} part file(s) to process.`);
//       await delay(ANKI_CONNECT_DELAY_MS);

//       let totalSucceeded = 0;
//       let totalUpdates = 0;
//       let filesFailed = 0;

//       for (let i = 0; i < partFiles.length; i++) {
//         const filePath = partFiles[i];
//         const fileName = path.basename(filePath);
//         const progress = formatProgress(i + 1, partFiles.length);
//         const spinner = createSpinner('');

//         spinner.start(`${progress} Processing ${fileName}...`);

//         try {
//           const updates = await readUpdateFile(filePath);
//           totalUpdates += updates.length;

//           if (updates.length === 0) {
//             spinner.stop();
//             logger.warn(`${progress} No valid note updates in ${fileName}. Deleting file.`);
//             await fs.rm(filePath);
//             continue;
//           }

//           let fileSucceeded = 0;
//           for (const update of updates) {
//             const success = await updateNoteExtra(update);
//             if (success) fileSucceeded++;
//           }
//           totalSucceeded += fileSucceeded;
//           spinner.stop();

//           const summary = `(${fileSucceeded}/${updates.length} successful)`;
//           if (fileSucceeded === updates.length) {
//             process.stdout.write(`${chalk.green('[OK]')} Processed ${fileName} ${summary}\n`);
//           } else {
//             process.stdout.write(
//               `${chalk.yellow('[WARN]')} Processed ${fileName} with some failures ${summary}\n`,
//             );
//           }

//           await fs.rm(filePath);
//         } catch (error: any) {
//           filesFailed++;
//           spinner.stop();
//           process.stdout.write(`${chalk.red('[ERROR]')} Failed to process ${fileName}: ${error.message}\n`);
//           // Do not delete file
//         }
//       }

//       logger.success('Update process finished.');
//       if (filesFailed > 0) {
//         logger.error(`${filesFailed} file(s) failed to process and were not deleted.`);
//       }
//       if (totalSucceeded < totalUpdates) {
//         logger.warn(`${totalSucceeded} of ${totalUpdates} notes updated successfully across all processed files.`);
//       } else if (totalUpdates > 0) {
//         logger.success(`All ${totalSucceeded} notes updated successfully.`);
//       }
//     } catch (error) {
//       handleError(error);
//     }
//   });

// export default updateExtraCmd;



// src/commands/update-extra.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { globby } from 'globby';
import fs from 'fs/promises';
import path from 'path';

import { logger } from '../utils/logger.js';
import { delayedAnkiRequest } from '../anki/connector.js';
import type { NoteUpdate } from '../anki/types.js';
import { handleError } from '../utils/errorHandler.js';
import { readJsonArray } from '../utils/file-utils.js';
import { DATA_DIR } from '../config/paths.js';
import { processInBatches } from '../utils/batchProcessor.js';

async function readUpdateFile(filePath: string): Promise<NoteUpdate[]> {
  const records = await readJsonArray<any>(filePath);
  return records
    .filter(r => typeof r.noteId === 'number' && typeof r.Extra === 'string')
    .map(r => ({ noteId: r.noteId, Extra: r.Extra }));
}

async function updateNoteExtra(note: NoteUpdate): Promise<boolean> {
  try {
    await delayedAnkiRequest('updateNoteFields', {
      note: { id: note.noteId, fields: { Extra: note.Extra } },
    });
    return true;
  } catch (err: any) {
    logger.error(`Failed to update Note ID ${note.noteId}: ${err.message}`);
    return false;
  }
}

const updateExtraCmd = new Command('update-extra')
  .description(`Processes 'output-part-*.json' files to update the "Extra" field in Anki notes, deleting each file after completion.`)
  .action(async () => {
    try {
      const pattern = path.join(DATA_DIR, 'output-part-*.json').replace(/\\/g, '/');
      const partFiles = await globby(pattern, { absolute: true });

      if (partFiles.length === 0) {
        logger.warn(`No 'output-part-*.json' files found in ${chalk.dim(DATA_DIR)}.`);
        return;
      }

      logger.info(`Found ${chalk.green(partFiles.length)} part file(s) to process.`);

      let totalSucceeded = 0;
      let totalUpdates = 0;
      let filesFailed = 0;

      for (const filePath of partFiles) {
        const fileName = path.basename(filePath);
        try {
          const updates = await readUpdateFile(filePath);
          totalUpdates += updates.length;

          if (updates.length === 0) {
            logger.warn(`No valid note updates in ${fileName}. Deleting file.`);
            await fs.rm(filePath);
            continue;
          }

          const result = await processInBatches({
            items: updates,
            processFn: updateNoteExtra,
            spinnerMessage: `Updating notes from ${fileName}`,
          });

          totalSucceeded += result.successCount;
          const summary = `(${result.successCount}/${result.totalCount} successful)`;

          if (result.successCount === result.totalCount) {
            logger.success(`Processed ${fileName} ${summary}`);
          } else {
            logger.warn(`Processed ${fileName} with some failures ${summary}`);
          }

          await fs.rm(filePath);
        } catch (error: any) {
          filesFailed++;
          logger.error(`Failed to process ${fileName}: ${error.message}`);
        }
      }

      logger.success('Update process finished.');
      if (filesFailed > 0) {
        logger.error(`${filesFailed} file(s) failed to process and were not deleted.`);
      }
      if (totalSucceeded < totalUpdates) {
        logger.warn(`${totalSucceeded} of ${totalUpdates} notes updated successfully across all processed files.`);
      } else if (totalUpdates > 0) {
        logger.success(`All ${totalSucceeded} notes updated successfully.`);
      }
    } catch (error) {
      handleError(error);
    }
  });

export default updateExtraCmd;