// src/commands/video.ts
import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import Table from 'cli-table3';

import { logger } from '../utils/logger.js';
import { handleError } from '../utils/errorHandler.js';
import { delayedAnkiRequest } from '../anki/connector.js';
import { DECK_NAME } from '../config/anki.js';
import { createSpinner } from '../utils/spinner.js';
import type { AnkiNote, VideoUpdate } from '../anki/types.js';
import { VIDEO_SERVER_URL } from '../config/app.js';
import { RECORDINGS_BASE_PATH } from '../config/paths.js';
import { processInBatches } from '../utils/batchProcessor.js';

// --- Type Definitions ---

interface AnkiSlData {
  noteId: number;
  sl: string;
}

interface VideoFile {
  name: string;
  path: string;
  birthtime: Date;
}

interface RenameMap {
  noteId: number;
  sl: string;
  originalPath: string;
  newPath: string;
}

// --- Constants ---

const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.webm'];

// --- Core Functions ---

/**
 * Fetches notes from the default Anki deck and returns a sorted list of their SL values and note IDs.
 */
async function fetchAnkiSls(): Promise<AnkiSlData[]> {
  const spinner = createSpinner(`Fetching notes from deck: ${chalk.cyan(DECK_NAME)}...`);
  spinner.start();
  try {
    const noteIds: number[] = await delayedAnkiRequest('findNotes', { query: `deck:"${DECK_NAME}"` });
    if (noteIds.length === 0) {
      throw new Error(`No notes found in deck "${DECK_NAME}".`);
    }

    spinner.setText(`Found ${noteIds.length} notes. Fetching details...`);
    const notesInfo: AnkiNote[] = await delayedAnkiRequest('notesInfo', { notes: noteIds });

    const slData = notesInfo
      .map(note => ({
        noteId: note.noteId,
        sl: note.fields.SL?.value,
      }))
      .filter((data): data is AnkiSlData => !!data.sl?.trim())
      .sort((a, b) => a.sl.localeCompare(b.sl)); // Sort by SL value

    if (slData.length === 0) {
      throw new Error('No notes with a valid SL field were found.');
    }

    spinner.stop();
    logger.success(`Found ${chalk.green(slData.length)} notes with SL values.`);
    return slData;
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

/**
 * Scans a directory for video files and returns them sorted by creation time.
 */
async function getVideoFiles(dirPath: string): Promise<VideoFile[]> {
  const spinner = createSpinner(`Scanning for video files in ${chalk.dim(dirPath)}...`);
  spinner.start();
  try {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });
    const videoFiles: VideoFile[] = [];

    for (const dirent of dirents) {
      const ext = path.extname(dirent.name).toLowerCase();
      if (dirent.isFile() && VIDEO_EXTENSIONS.includes(ext)) {
        const fullPath = path.join(dirPath, dirent.name);
        const stats = await fs.stat(fullPath);
        videoFiles.push({
          name: dirent.name,
          path: fullPath,
          birthtime: stats.birthtime,
        });
      }
    }

    if (videoFiles.length === 0) {
      throw new Error('No video files found in the specified directory.');
    }

    videoFiles.sort((a, b) => a.birthtime.getTime() - b.birthtime.getTime());

    spinner.stop();
    logger.success(`Found ${chalk.green(videoFiles.length)} video file(s).`);
    return videoFiles;
  } catch (error: any) {
    spinner.stop();
    if (error.code === 'ENOENT') throw new Error(`Directory not found: ${dirPath}`);
    throw error;
  }
}

/**
 * Displays a preview of the file renames in a table format using cli-table3.
 */
function previewChanges(maps: RenameMap[]): void {
  logger.log('---');
  logger.info(chalk.bold.cyan('--- PREVIEW OF FILE RENAMES ---'));

  const table = new Table({
    head: [chalk.cyan.bold('SL'), chalk.cyan.bold('Original File'), chalk.cyan.bold('New File')],
    colAligns: ['center', 'left', 'left'],
    style: { head: [], border: [] },
    wordWrap: true,
    chars: {
      top: '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
      bottom: '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
      left: '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼',
      right: '║', 'right-mid': '╢', 'middle': '│',
    },
  });

  maps.forEach(map => {
    table.push([map.sl, path.basename(map.originalPath), path.basename(map.newPath)]);
  });

  console.log(table.toString());
  logger.log('---');
}

/**
 * Asks for user confirmation and applies the file renames.
 * @returns `true` if renames were applied, `false` otherwise.
 */
async function confirmAndApplyRenames(maps: RenameMap[]): Promise<boolean> {
  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: `Apply these ${chalk.yellow(maps.length)} file renames?`,
      default: false,
    },
  ]);

  if (!proceed) {
    logger.warn('Rename operation cancelled by user. No files were changed.');
    return false;
  }

  const spinner = createSpinner('Renaming files...');
  spinner.start();
  let successCount = 0;
  for (const map of maps) {
    try {
      await fs.rename(map.originalPath, map.newPath);
      successCount++;
    } catch (error: any) {
      spinner.stop();
      logger.error(`Failed to rename ${path.basename(map.originalPath)}: ${error.message}`);
      spinner.start();
    }
  }

  spinner.stop();
  logger.success(`Successfully renamed ${chalk.green(successCount)}/${maps.length} files.`);
  return true;
}

/**
 * Updates the 'Video' field for a single Anki note.
 */
async function applyVideoUpdate(update: VideoUpdate): Promise<boolean> {
  try {
    await delayedAnkiRequest('updateNoteFields', {
      note: { id: update.noteId, fields: { Video: update.videoFile } },
    });
    return true;
  } catch (err: any) {
    logger.error(`Failed to update video field for Note ID ${update.noteId}: ${err.message}`);
    return false;
  }
}

/**
 * Updates the 'Video' field for the specified Anki notes.
 */
async function updateAnkiVideoFields(updates: VideoUpdate[]): Promise<void> {
  logger.info('Updating video fields in Anki...');

  const { successCount, totalCount } = await processInBatches({
    items: updates,
    processFn: applyVideoUpdate,
    spinnerMessage: 'Updating Anki video fields',
  });

  logger.success(`Update complete. Successfully updated ${chalk.green(successCount)}/${totalCount} video fields.`);
  if (successCount < totalCount) {
    logger.error(`${totalCount - successCount} notes failed to update. Check logs above.`);
  }
}

// --- CLI Command ---

const videoCmd = new Command('video')
  .description('Map sorted SL values to sorted video files, rename them, and update Anki notes.')
  .argument('<path>', 'Path to the directory containing video files')
  .action(async (dirPath: string) => {
    try {
      const absolutePath = path.resolve(dirPath);

      const [slData, videoFiles] = await Promise.all([fetchAnkiSls(), getVideoFiles(absolutePath)]);

      if (slData.length !== videoFiles.length) {
        logger.error(
          `Mismatch: Found ${chalk.yellow(slData.length)} SL values but ${chalk.yellow(
            videoFiles.length,
          )} video files.`,
        );
        logger.warn('Please ensure the number of notes and videos match before proceeding.');
        return;
      }

      const renameMaps: RenameMap[] = slData.map((data, index) => {
        const videoFile = videoFiles[index];
        const ext = path.extname(videoFile.name);
        const newName = `${data.sl}${ext}`;
        return {
          noteId: data.noteId,
          sl: data.sl,
          originalPath: videoFile.path,
          newPath: path.join(absolutePath, newName),
        };
      });

      previewChanges(renameMaps);
      const renamesApplied = await confirmAndApplyRenames(renameMaps);

      if (renamesApplied) {
        const videoUpdates: VideoUpdate[] = renameMaps.map(map => {
          const relativePath = path.relative(RECORDINGS_BASE_PATH, absolutePath).replace(/\\/g, '/');
          const videoFileName = path.basename(map.newPath);
          const videoUrl = `${VIDEO_SERVER_URL}/${relativePath}/${videoFileName}`;
          const videoLink = `<a href="${videoUrl}">Video</a>`;

          return {
            noteId: map.noteId,
            videoFile: videoLink,
          };
        });

        await updateAnkiVideoFields(videoUpdates);
      }
    } catch (error) {
      handleError(error);
    }
  });

export default videoCmd;