// // src/commands/update-tag.ts
// import { Command } from 'commander';
// import chalk from 'chalk';
// import { globby } from 'globby';
// import fs from 'fs/promises';
// import path from 'path';

// import { logger } from '../utils/logger.js';
// import { ankiConnectRequest } from '../anki/connector.js';
// import type { TagUpdate } from '../anki/types.js';
// import { delay } from '../utils/timers.js';
// import { ANKI_CONNECT_ACTIONS } from '../config/anki.js';
// import { handleError } from '../utils/errorHandler.js';
// import { readJsonArray } from '../utils/file-utils.js';
// import { formatProgress } from '../utils/formatters.js';
// import { DATA_DIR } from '../config/paths.js';
// import { createSpinner } from '../utils/spinner.js';
// import { ANKI_CONNECT_DELAY_MS } from '../config/app.js';

// async function readTagsUpdateFile(filePath: string): Promise<TagUpdate[]> {
//   const records = await readJsonArray<any>(filePath);
//   return records
//     .filter(r => typeof r.noteId === 'number' && typeof r.newTag === 'string' && r.newTag.trim())
//     .map(r => ({ noteId: r.noteId, newTag: r.newTag }));
// }

// async function delayedAnkiRequest<T>(action: string, params: object): Promise<T> {
//   await delay(ANKI_CONNECT_DELAY_MS); // 1-second delay before every Anki call
//   return ankiConnectRequest(action, params);
// }

// async function addSubjectTag(update: TagUpdate): Promise<boolean> {
//   const subjectTag = update.newTag.trim();
//   if (!subjectTag) return false;

//   try {
//     await delayedAnkiRequest(ANKI_CONNECT_ACTIONS.ADD_TAGS, {
//       notes: [update.noteId],
//       tags: subjectTag,
//     });
//     return true;
//   } catch {
//     return false;
//   }
// }

// async function replaceTopicTag(update: TagUpdate): Promise<boolean> {
//   const tagToReplace = update.newTag.split('::')[0]?.trim();
//   if (!tagToReplace) return false;

//   try {
//     await delayedAnkiRequest(ANKI_CONNECT_ACTIONS.REPLACE_TAGS, {
//       notes: [update.noteId],
//       tag_to_replace: tagToReplace,
//       replace_with_tag: update.newTag,
//     });
//     return true;
//   } catch {
//     return false;
//   }
// }

// const updateTagCmd = new Command('update-tag')
//   .description(`Processes 'output-part-*.json' files to update Anki tags, deleting each file after completion.`)
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
//           const updates = await readTagsUpdateFile(filePath);
//           totalUpdates += updates.length;

//           if (updates.length === 0) {
//             spinner.stop();
//             logger.warn(`${progress} No valid tag updates in ${fileName}. Deleting file.`);
//             await fs.rm(filePath);
//             continue;
//           }

//           let fileSucceeded = 0;
//           for (const update of updates) {
//             const success = update.newTag.includes('::')
//               ? await replaceTopicTag(update)
//               : await addSubjectTag(update);

//             if (success) fileSucceeded++;
//           }

//           totalSucceeded += fileSucceeded;
//           spinner.stop();

//           const summary = `(${fileSucceeded}/${updates.length} successful)`;
//           if (fileSucceeded === updates.length) {
//             process.stdout.write(`${chalk.green('[OK]')} Processed ${fileName} ${summary}\n`);
//           } else {
//             process.stdout.write(`${chalk.yellow('[WARN]')} Processed ${fileName} with some failures ${summary}\n`);
//           }

//           await fs.rm(filePath);
//         } catch (error: any) {
//           filesFailed++;
//           spinner.stop();
//           process.stdout.write(`${chalk.red('[ERROR]')} Failed to process ${fileName}: ${error.message}\n`);
//         }
//       }

//       logger.success('Tag update process finished.');
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

// export default updateTagCmd;


// src/commands/update-tag.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { globby } from 'globby';
import fs from 'fs/promises';
import path from 'path';

import { logger } from '../utils/logger.js';
import { delayedAnkiRequest } from '../anki/connector.js';
import type { TagUpdate } from '../anki/types.js';
import { ANKI_CONNECT_ACTIONS } from '../config/anki.js';
import { handleError } from '../utils/errorHandler.js';
import { readJsonArray } from '../utils/file-utils.js';
import { DATA_DIR } from '../config/paths.js';
import { processInBatches } from '../utils/batchProcessor.js';

async function readTagsUpdateFile(filePath: string): Promise<TagUpdate[]> {
  const records = await readJsonArray<any>(filePath);
  return records
    .filter(r => typeof r.noteId === 'number' && typeof r.newTag === 'string' && r.newTag.trim())
    .map(r => ({ noteId: r.noteId, newTag: r.newTag }));
}

async function processTagUpdate(update: TagUpdate): Promise<boolean> {
  const isTopicTag = update.newTag.includes('::');
  
  try {
    if (isTopicTag) {
      const tagToReplace = update.newTag.split('::')[0]?.trim();
      if (!tagToReplace) return false;
      await delayedAnkiRequest(ANKI_CONNECT_ACTIONS.REPLACE_TAGS, {
        notes: [update.noteId],
        tag_to_replace: tagToReplace,
        replace_with_tag: update.newTag,
      });
    } else {
      const subjectTag = update.newTag.trim();
      if (!subjectTag) return false;
      await delayedAnkiRequest(ANKI_CONNECT_ACTIONS.ADD_TAGS, {
        notes: [update.noteId],
        tags: subjectTag,
      });
    }
    return true;
  } catch (err: any) {
    logger.error(`Failed to update tag for Note ID ${update.noteId}: ${err.message}`);
    return false;
  }
}

const updateTagCmd = new Command('update-tag')
  .description(`Processes 'output-part-*.json' files to update Anki tags, deleting each file after completion.`)
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
          const updates = await readTagsUpdateFile(filePath);
          totalUpdates += updates.length;

          if (updates.length === 0) {
            logger.warn(`No valid tag updates in ${fileName}. Deleting file.`);
            await fs.rm(filePath);
            continue;
          }

          const result = await processInBatches({
            items: updates,
            processFn: processTagUpdate,
            spinnerMessage: `Updating tags from ${fileName}`,
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

      logger.success('Tag update process finished.');
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

export default updateTagCmd;