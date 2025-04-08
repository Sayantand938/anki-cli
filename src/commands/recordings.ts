// src/commands/recordings.ts
import type { Command } from "commander";
import axios from "axios";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";

// --- Configuration ---
const ANKICONNECT_URL = "http://127.0.0.1:8765";
const TARGET_DECK_NAME = "Custom Study Session";
const ANKICONNECT_VERSION = 6;
const VIDEO_EXTENSION = ".mkv";
const BACKUP_DIR_NAME = "temp_video_backup";

interface FileInfo {
    fileName: string;
    filePath: string;
    createdMs: number;
}

// --- AnkiConnect Helper ---
async function fetchNoteIdsFromDeck(deckName: string): Promise<number[]> {
    const payload = {
        action: "findNotes",
        version: ANKICONNECT_VERSION,
        params: { query: `deck:"${deckName}"` }
    };
    try {
        const response = await axios.post(ANKICONNECT_URL, payload);
        if (response.data.error) {
            throw new Error(`AnkiConnect Error: ${response.data.error}`);
        }
        if (!Array.isArray(response.data.result)) {
            throw new Error(`AnkiConnect Error: Unexpected response format.`);
        }
        const noteIds = response.data.result as number[];
        return noteIds;
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNREFUSED') {
                console.error(chalk.red(`❌ Error: Connection refused. Is Anki open and AnkiConnect installed/running on ${ANKICONNECT_URL}?`));
            } else {
                console.error(chalk.red(`❌ Axios Error: ${error.message}`));
            }
        } else {
            console.error(chalk.red(`❌ Error fetching notes: ${error.message}`));
        }
        throw new Error(`Failed to fetch notes from deck "${deckName}".`);
    }
}

// --- File System Helpers ---

/** Gets video files, sorts by creation time */
async function getSortedVideos(directoryPath: string): Promise<FileInfo[]> {
    try {
        const allFiles = await fs.readdir(directoryPath);
        const videoFilesPromises = allFiles
            .filter(file => path.extname(file).toLowerCase() === VIDEO_EXTENSION)
            .map(async (fileName): Promise<FileInfo | null> => {
                const filePath = path.join(directoryPath, fileName);
                try {
                    const stats = await fs.stat(filePath);
                    if (stats.isFile()) {
                        return { fileName, filePath, createdMs: stats.birthtimeMs };
                    }
                } catch (statError: any) {
                    console.warn(chalk.yellow(`⚠️ Could not get stats for ${fileName}: ${statError.message}`));
                }
                return null;
            });

        const videoFilesInfo = (await Promise.all(videoFilesPromises))
                                .filter((info): info is FileInfo => info !== null);

        videoFilesInfo.sort((a, b) => a.createdMs - b.createdMs);
        return videoFilesInfo;

    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.error(chalk.red(`❌ Error: Directory not found: ${directoryPath}`));
        } else if (error.code === 'EACCES') {
             console.error(chalk.red(`❌ Error: Permission denied to read directory: ${directoryPath}`));
        } else {
            console.error(chalk.red(`❌ Error reading directory: ${error.message}`));
        }
        throw new Error(`Failed to process directory "${directoryPath}".`);
    }
}

/**
 * Checks if the video files are already named according to the note IDs.
 * Assumes lists are pre-sorted and have the same length.
 */
function areVideosAlreadyNamedCorrectly(sortedVideoFiles: FileInfo[], noteIds: number[]): boolean {
    if (sortedVideoFiles.length === 0) {
        return true; // Nothing to check, vacuously true
    }
    for (let i = 0; i < sortedVideoFiles.length; i++) {
        const fileInfo = sortedVideoFiles[i];
        const expectedNameWithoutExt = noteIds[i].toString();
        const actualNameWithoutExt = path.basename(fileInfo.fileName, VIDEO_EXTENSION);

        if (actualNameWithoutExt !== expectedNameWithoutExt) {
            return false; // Found a mismatch
        }
    }
    return true; // All names matched
}


/** Creates backup copies of the video files */
async function backupVideos(videoFiles: FileInfo[], sourceDirectory: string): Promise<string> {
    const parentDirectory = path.dirname(sourceDirectory);
    const backupDirPath = path.join(parentDirectory, BACKUP_DIR_NAME);
    try {
        await fs.mkdir(backupDirPath, { recursive: true });
        const copyPromises = videoFiles.map(fileInfo => {
            const sourcePath = fileInfo.filePath;
            const destPath = path.join(backupDirPath, fileInfo.fileName);
            return fs.copyFile(sourcePath, destPath)
                     .catch(copyError => {
                         console.error(chalk.red(`   ❌ Failed to copy ${fileInfo.fileName} to backup: ${copyError.message}`));
                         throw copyError;
                     });
        });
        await Promise.all(copyPromises);
        return backupDirPath;

    } catch (error: any) {
         if (error.code === 'EACCES') {
             console.error(chalk.red(`❌ Error: Permission denied to create backup directory or copy files into: ${backupDirPath}`));
         } else {
             console.error(chalk.red(`❌ Error during backup process: ${error.message}`));
         }
        throw new Error('Failed to create video backups.');
    }
}

/** Renames video files based on note IDs */
async function renameVideos(sortedVideoFiles: FileInfo[], noteIds: number[], directoryPath: string): Promise<number> {
    let renameCount = 0;
    const renamePromises = sortedVideoFiles.map(async (fileInfo, index) => {
        const noteId = noteIds[index];
        const oldPath = fileInfo.filePath;
        const newFileName = `${noteId}${VIDEO_EXTENSION}`;
        const newPath = path.join(directoryPath, newFileName);

        try {
            await fs.access(newPath, fs.constants.F_OK);
            // Only log warning if we intended to rename but couldn't
             if (path.basename(oldPath) !== newFileName) {
                console.warn(chalk.yellow(`⚠️ Skipping rename: Target file already exists: ${newFileName}`));
            }
            return; // Skip this file if target exists
        } catch (accessError: any) {
            if (accessError.code !== 'ENOENT') {
                 console.error(chalk.red(`   ❌ Error checking target file ${newFileName}: ${accessError.message}`));
                 throw accessError;
            }
            // ENOENT means file doesn't exist, which is good, continue to rename
        }

        try {
            await fs.rename(oldPath, newPath);
            renameCount++;
        } catch (renameError: any) {
             if (renameError.code === 'EACCES' || renameError.code === 'EPERM') {
                 console.error(chalk.red(`   ❌ Permission denied renaming ${fileInfo.fileName} to ${newFileName}.`));
             } else {
                console.error(chalk.red(`   ❌ Failed to rename ${fileInfo.fileName}: ${renameError.message}`));
             }
            throw renameError;
        }
    });

    await Promise.all(renamePromises);
    return renameCount;
}


// --- Command Action Handler ---
async function handleRecordingsCommand(directoryPathArg: string) {
    const absoluteDirectoryPath = path.resolve(process.cwd(), directoryPathArg);
    let noteIds: number[] = [];
    let sortedVideoFiles: FileInfo[] = [];
    let renamedCount = 0;

    try {
        // 1. Fetch Note IDs
        noteIds = await fetchNoteIdsFromDeck(TARGET_DECK_NAME);
        if (noteIds.length === 0) {
            console.log(chalk.yellow(`\n⚠️ No notes found in deck "${TARGET_DECK_NAME}". Cannot proceed.`));
            process.exitCode = 0;
            return;
        }

        // 2. Get and Sort Videos
        sortedVideoFiles = await getSortedVideos(absoluteDirectoryPath);
        if (sortedVideoFiles.length === 0) {
             console.log(chalk.yellow(`\n⚠️ No "${VIDEO_EXTENSION}" files found in "${absoluteDirectoryPath}". Cannot proceed.`));
             process.exitCode = 0;
             return;
        }

        // 3. Verify Count Match
        if (noteIds.length !== sortedVideoFiles.length) {
            console.error(chalk.red(`❌ Error: Mismatch between note count (${noteIds.length}) and video file count (${sortedVideoFiles.length}).`));
            console.error(chalk.red(`   Please ensure the number of "${VIDEO_EXTENSION}" files in the directory matches the number of notes in the "${TARGET_DECK_NAME}" deck.`));
            process.exitCode = 1;
            return;
        }

        // 4. Check: Are files already named correctly?
        if (areVideosAlreadyNamedCorrectly(sortedVideoFiles, noteIds)) {
            console.log(chalk.green(`✅ All ${sortedVideoFiles.length} video files in "${absoluteDirectoryPath}" are already correctly named.`));
            process.exitCode = 0;
            return; // Exit early, nothing to do
        }

        // 5. Backup Videos (Only run if renaming is needed)
        await backupVideos(sortedVideoFiles, absoluteDirectoryPath);

        // 6. Rename Videos (Only run if renaming is needed)
        renamedCount = await renameVideos(sortedVideoFiles, noteIds, absoluteDirectoryPath);

        // 7. Final Success Output (Only shown if renaming occurred)
        console.log(chalk.green(`✅ Found ${noteIds.length} notes in "${TARGET_DECK_NAME}"`));
        console.log(chalk.green(`✅ Found ${sortedVideoFiles.length} videos in "${absoluteDirectoryPath}"`));
        console.log(chalk.green(`✅ Backup created`));
        console.log(chalk.green(`✅ Successfully renamed ${renamedCount} files.`));

        process.exitCode = 0;

    } catch (error: any) {
         console.error(chalk.red(`\n--- Operation Failed ---`));
         if (error && error.message && !(error.message.includes("Failed to") || error.message.includes("Error:"))) {
             console.error(chalk.red(error.message));
         } else if (!error?.message) {
             console.error(chalk.red("An unexpected error occurred."));
         }
         if (noteIds.length > 0 || sortedVideoFiles.length > 0) {
             console.error(chalk.yellow(`   Notes found: ${noteIds.length > 0 ? noteIds.length : 'N/A'}`));
             console.error(chalk.yellow(`   Videos found: ${sortedVideoFiles.length > 0 ? sortedVideoFiles.length : 'N/A'}`));
         }
         process.exitCode = 1;
    }
}

// --- Register Command with Commander ---
export function registerRecordingsCommand(program: Command): void {
    program
        .command("recordings <directoryPath>")
        .description(`Matches "${VIDEO_EXTENSION}" videos in <directoryPath> (by creation date) to notes in "${TARGET_DECK_NAME}" deck. If names don't match Note IDs, creates a backup and renames videos. Checks if files are already correctly named.`)
        .action(handleRecordingsCommand);
}