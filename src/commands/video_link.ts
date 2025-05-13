import fs from "fs/promises";
import path from "path";
import axios, { AxiosError } from 'axios';
import { Command } from 'commander';

// Configuration constants
const ANKI_CONNECT_URL = "http://localhost:8765";
const TOKEN_FIELD_NAME = "TokenNo";
const TARGET_UPDATE_FIELD = "Video";
const ANKI_API_VERSION = 6;
const ANKI_REQUEST_TIMEOUT = 15000;
const DEFAULT_DECK_NAME = "Custom Study Session";
const DEFAULT_TARGET_COPY_DIR = "D:\\AnkiData\\CGL\\collection.media"; // Default Anki media collection path
const PRE_PROCESSING_DELAY_MS = 3000;
const INTER_NOTE_DELAY_MS = 1000;

// Output constants
const SUCCESS_MARK = "[✓]";
const FAILURE_MARK = "[✗]";
const INDENT = "    ";

// Type Definitions
interface AnkiNoteInfoFetched {
    noteId: number;
    fields: Record<string, { value: string, order: number }>;
}

interface ExtractedNoteInfo {
    noteId: number;
    tokenNo: string;
}

interface MkvFile {
    path: string;
    name: string;
}

interface ProcessItem {
    index: number;
    originalPath: string;
    originalFilename: string;
    noteId: number;
    token: string;
    newFilename: string;
    newPathInSource: string; // Path after renaming in source
    targetCopyPath: string; // Final path in Anki media
    soundTag: string; // Anki sound tag
}

export interface VideolinkCommandOptions {
    path: string; // Source folder path for MKV files
    ankiMediaDir?: string; // Optional override for Anki media directory
    deck?: string; // Optional override for Anki deck name
    tokenField?: string; // Optional override for the token field name
    videoField?: string; // Optional override for the target video field name
}

// Helper: Send request to AnkiConnect
async function ankiConnectRequest(action: string, params: Record<string, any> = {}): Promise<any> {
    try {
        const response = await axios.post(ANKI_CONNECT_URL, {
            action: action,
            version: ANKI_API_VERSION,
            params: params
        }, { timeout: ANKI_REQUEST_TIMEOUT });

        if (response.data.error) {
            // Enhance error messages for specific AnkiConnect errors
            if (action === "notesInfo" && response.data.error.includes("deck was not found")) {
                const deckName = params?.query?.match(/deck:"([^"]+)"/)?.[1] || 'provided name';
                throw new Error(`AnkiConnect Error: Deck "${deckName}" not found.`);
            }
            if (action === "updateNoteFields") {
                if (response.data.error.includes("field not found") || response.data.error.includes("no field named")) {
                    const fieldName = Object.keys(params?.note?.fields ?? {})[0] || TARGET_UPDATE_FIELD;
                    throw new Error(`AnkiConnect Error: Field "${fieldName}" not found in note ID ${params?.note?.id}. Ensure it exists in the note type.`);
                }
            }
            throw new Error(`AnkiConnect API Error (${action}): ${response.data.error}`);
        }
        if (response.data.hasOwnProperty("result")) {
            return response.data.result;
        } else {
            throw new Error(`AnkiConnect response missing 'result' field for action ${action}.`);
        }
    } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.isAxiosError) {
            if (axiosError.code === 'ECONNREFUSED') {
                throw new Error(`Connection refused at ${ANKI_CONNECT_URL}. Is Anki open and AnkiConnect installed/enabled?`);
            }
            if (axiosError.response) {
                throw new Error(`AnkiConnect request failed: ${axiosError.message} (Status: ${axiosError.response.status}, Data: ${JSON.stringify(axiosError.response.data)})`);
            } else if (axiosError.request) {
                throw new Error(`AnkiConnect request error: ${axiosError.message}. Check network or AnkiConnect status.`);
            }
        }
        throw error; // Re-throw if not an Axios error
    }
}

// Helper: Fetch required info from Anki notes in a deck
async function fetchNoteInfoForDeck(deckName: string, tokenFieldName: string): Promise<ExtractedNoteInfo[]> {
    let notesInfo: AnkiNoteInfoFetched[];
    try {
        notesInfo = await ankiConnectRequest("notesInfo", { query: `deck:"${deckName}"` });
    } catch (err: any) {
        throw new Error(`[Anki] Failed to fetch notes info: ${err.message}`);
    }

    if (!notesInfo || notesInfo.length === 0) {
        return [];
    }

    const extractedNotes: ExtractedNoteInfo[] = [];
    let skippedCount = 0;

    notesInfo.forEach(note => {
        const tokenValue = note?.fields?.[tokenFieldName]?.value;
        const noteId = note?.noteId;

        if (!noteId || !tokenValue) {
            skippedCount++;
            return;
        }

        const sanitizedToken = tokenValue.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
        if (!sanitizedToken) {
            skippedCount++;
            return;
        }

        extractedNotes.push({ noteId: noteId, tokenNo: sanitizedToken });
    });

    if (skippedCount > 0) {
        console.warn(`[INFO] ${skippedCount} Anki notes were excluded due to missing Note ID or missing/invalid '${tokenFieldName}'.`);
    }
    return extractedNotes;
}

// Helper: Get and sort MKV files by creation time
async function getSortedMkvFiles(folderPath: string): Promise<MkvFile[]> {
    let filesWithStats: { path: string; name: string; timeMs: number }[] = [];
    try {
        const dirents = await fs.readdir(folderPath, { withFileTypes: true });
        const mkvFiles = dirents.filter(dirent => dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.mkv');

        for (const file of mkvFiles) {
            const fullPath = path.join(folderPath, file.name);
            try {
                const stats = await fs.stat(fullPath);
                filesWithStats.push({ path: fullPath, name: file.name, timeMs: stats.birthtimeMs || stats.mtimeMs });
            } catch (statError: any) {
                console.warn(`[FS] Warning: Could not get stats for "${file.name}": ${statError.message}. Skipping file.`);
            }
        }
    } catch (readDirError: any) {
        throw new Error(`[FS] Failed to read directory "${folderPath}": ${readDirError.message}`);
    }

    filesWithStats.sort((a, b) => a.timeMs - b.timeMs);
    return filesWithStats.map(f => ({ path: f.path, name: f.name }));
}

// Helper: Simple delay
function delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Core Processing Logic: Matches files and notes, renames, copies, and updates Anki
async function processFilesAndNotes(
    sourceFolderPath: string,
    deckNameToUse: string,
    targetCopyDir: string,
    tokenFieldName: string,
    targetUpdateFieldAnki: string
): Promise<number> { // Returns exit code (0 for success, 1 for failure)
    let fileCount = 0;
    let noteCount = 0;
    let processCount = 0;
    let successRenameCount = 0, failRenameCount = 0, skippedRenameCount = 0;
    let successCopyCount = 0, failCopyCount = 0;
    let successAnkiUpdateCount = 0, failAnkiUpdateCount = 0;
    let overallSuccessCount = 0;

    // 1. Preparation and Validation
    try {
        await fs.access(targetCopyDir, fs.constants.W_OK);
        const stats = await fs.stat(targetCopyDir);
        if (!stats.isDirectory()) throw new Error(`Target copy path "${targetCopyDir}" exists but is not a directory.`);
    } catch (err: any) {
        if (err.code === 'ENOENT') throw new Error(`Target copy directory not found: "${targetCopyDir}". Please create it or ensure the path is correct.`);
        else if (err.code === 'EACCES' || err.code === 'EPERM') throw new Error(`No write permission for target copy directory: "${targetCopyDir}".`);
        else throw new Error(`Error accessing target copy directory "${targetCopyDir}": ${err.message}`);
    }

    const fetchedNotes = await fetchNoteInfoForDeck(deckNameToUse, tokenFieldName);
    noteCount = fetchedNotes.length;
    if (noteCount === 0) {
        console.error("[INFO] No valid notes fetched from Anki. Nothing to process.");
        return 0;
    }

    const sortedMkvFiles = await getSortedMkvFiles(sourceFolderPath);
    fileCount = sortedMkvFiles.length;
    if (fileCount === 0) {
        console.error("[INFO] No MKV files found in the source folder. Nothing to process.");
        return 0;
    }

    processCount = Math.min(fileCount, noteCount);
    if (fileCount !== noteCount) {
        console.warn(`[WARNING] Mismatch: ${fileCount} MKV files vs ${noteCount} Anki notes. Processing the first ${processCount} pairs based on MKV creation time order.`);
    }
    if (processCount === 0) {
        console.error("[INFO] No file/note pairs to process after matching.");
        return 0;
    }

    const itemsToProcess: ProcessItem[] = [];
    for (let i = 0; i < processCount; i++) {
        const fileInfo = sortedMkvFiles[i];
        const noteInfo = fetchedNotes[i];
        const token = noteInfo.tokenNo;
        const newFilename = `${token}.mkv`;
        const newPathInSource = path.join(sourceFolderPath, newFilename);
        itemsToProcess.push({
            index: i,
            originalPath: fileInfo.path,
            originalFilename: fileInfo.name,
            noteId: noteInfo.noteId,
            token: token,
            newFilename: newFilename,
            newPathInSource: newPathInSource,
            targetCopyPath: path.join(targetCopyDir, newFilename),
            soundTag: `[sound:${newFilename}]`,
        });
    }

    if (PRE_PROCESSING_DELAY_MS > 0) {
        await delay(PRE_PROCESSING_DELAY_MS);
    }

    // 2. Processing Loop
    console.log(`\n--- Processing ${processCount} Matched Items ---`);

    for (let i = 0; i < itemsToProcess.length; i++) {
        const item = itemsToProcess[i];
        console.log(`\n[${i + 1}/${processCount}] NoteID: ${item.noteId}, Token: ${item.token}`);

        let pathForCopy = item.originalPath; // Start with original path for copy
        let itemFullyProcessed = true;

        // Step 2a: Rename (in source folder) or check if already renamed
        if (item.originalPath === item.newPathInSource) {
            console.log(`${INDENT}${SUCCESS_MARK} Renaming skipped (file "${item.originalFilename}" already matches token name)`);
            successRenameCount++;
            skippedRenameCount++;
        } else {
            try {
                // Check if target name already exists in source. If so, use it.
                await fs.access(item.newPathInSource, fs.constants.R_OK);
                console.log(`${INDENT}${SUCCESS_MARK} Renaming "${item.originalFilename}" to "${item.newFilename}" in source`);
                console.log(`${INDENT}${INDENT}[INFO] Target file "${item.newFilename}" already exists in source. Using existing file for copy.`);
                pathForCopy = item.newPathInSource; // Use the existing file for copy
                successRenameCount++; // Count as success as the desired state exists
                skippedRenameCount++;
            } catch (accessError: any) {
                if (accessError.code === 'ENOENT') {
                    // Target name does not exist, proceed with rename
                    try {
                        await fs.rename(item.originalPath, item.newPathInSource);
                        console.log(`${INDENT}${SUCCESS_MARK} Renaming "${item.originalFilename}" to "${item.newFilename}" in source`);
                        successRenameCount++;
                        pathForCopy = item.newPathInSource; // Update path for copy after successful rename
                    } catch (renameError: any) {
                        console.log(`${INDENT}${FAILURE_MARK} Renaming "${item.originalFilename}" to "${item.newFilename}" in source`);
                        console.log(`${INDENT}${INDENT}Error: ${renameError.message}`);
                        failRenameCount++;
                        itemFullyProcessed = false;
                    }
                } else {
                    // Other access errors
                    console.log(`${INDENT}${FAILURE_MARK} Checking for target rename path "${item.newFilename}"`);
                    console.log(`${INDENT}${INDENT}Error: ${accessError.message}`);
                    failRenameCount++;
                    itemFullyProcessed = false;
                }
            }
        }

        if (!itemFullyProcessed) {
            if (i < itemsToProcess.length - 1 && INTER_NOTE_DELAY_MS > 0) await delay(INTER_NOTE_DELAY_MS);
            continue; // Skip copy and update for this item if rename/check failed
        }

        // Step 2b: Copy (from source to Anki media)
        try {
            await fs.copyFile(pathForCopy, item.targetCopyPath);
            console.log(`${INDENT}${SUCCESS_MARK} Copying "${path.basename(pathForCopy)}" to "${targetCopyDir}"`);
            successCopyCount++;
        } catch (copyError: any) {
            console.log(`${INDENT}${FAILURE_MARK} Copying "${path.basename(pathForCopy)}" to "${targetCopyDir}"`);
            console.log(`${INDENT}${INDENT}Error: ${copyError.message}`);
            failCopyCount++;
            itemFullyProcessed = false;
        }

        if (!itemFullyProcessed) {
            if (i < itemsToProcess.length - 1 && INTER_NOTE_DELAY_MS > 0) await delay(INTER_NOTE_DELAY_MS);
            continue; // Skip update if copy failed
        }

        // Step 2c: Update Anki Note
        try {
            const payload = { note: { id: item.noteId, fields: { [targetUpdateFieldAnki]: item.soundTag } } };
            await ankiConnectRequest("updateNoteFields", payload);
            console.log(`${INDENT}${SUCCESS_MARK} Updating Anki field "${targetUpdateFieldAnki}" with "${item.soundTag}"`);
            successAnkiUpdateCount++;
            overallSuccessCount++; // Count as overall success only if all steps completed
        } catch (updateError: any) {
            console.log(`${INDENT}${FAILURE_MARK} Updating Anki field "${targetUpdateFieldAnki}" with "${item.soundTag}"`);
            console.log(`${INDENT}${INDENT}Error: ${updateError.message}`);
            failAnkiUpdateCount++;
            itemFullyProcessed = false; // Mark as not fully processed if Anki update fails
        }

        if (i < itemsToProcess.length - 1 && INTER_NOTE_DELAY_MS > 0) {
            await delay(INTER_NOTE_DELAY_MS);
        }
    } // End of loop

    if (failRenameCount > 0 || failCopyCount > 0 || failAnkiUpdateCount > 0) {
        console.error("\nErrors occurred during processing. Please review the logs above.");
        return 1;
    } else if (processCount > 0 && overallSuccessCount === processCount) {
        console.log("\nAll items processed successfully!");
        return 0;
    } else if (processCount > 0) {
        console.log("\nProcessing finished, but some items may not have completed all steps (check logs).");
        return 0; // Partial success counts as 0 exit code for CLI tools usually
    }
    return 0; // No items processed, no errors
}

// CLI Command Action: Handles command line arguments and orchestrates the process
export async function videolinkAction(options: VideolinkCommandOptions): Promise<void> {
    let resolvedSourcePath = '';
    try {
        resolvedSourcePath = path.resolve(options.path.trim());
        const stats = await fs.stat(resolvedSourcePath);
        if (!stats.isDirectory()) {
            throw new Error(`The provided source path is not a directory: "${resolvedSourcePath}"`);
        }
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            throw new Error(`Source folder not found: "${resolvedSourcePath}" (Resolved from "${options.path}")`);
        }
        throw new Error(`Error accessing source path "${options.path}": ${err.message}`);
    }

    const deckNameToUse = options.deck || DEFAULT_DECK_NAME;
    const targetCopyDir = options.ankiMediaDir || DEFAULT_TARGET_COPY_DIR;
    const tokenFieldName = options.tokenField || TOKEN_FIELD_NAME;
    const targetUpdateFieldAnki = options.videoField || TARGET_UPDATE_FIELD;

    console.log(`Starting video linking process...`);
    console.log(`Source MKVs: "${resolvedSourcePath}"`);
    console.log(`Target Anki Deck: "${deckNameToUse}"`);
    console.log(`Anki Media Dir: "${targetCopyDir}"`);
    console.log(`Token Field: "${tokenFieldName}"`);
    console.log(`Video Field: "${targetUpdateFieldAnki}"`);

    const exitCode = await processFilesAndNotes(
        resolvedSourcePath,
        deckNameToUse,
        targetCopyDir,
        tokenFieldName,
        targetUpdateFieldAnki
    );

    if (exitCode !== 0) {
        throw new Error("Video linking process completed with errors. Check logs for details.");
    } else {
        console.log("Video linking process finished.");
    }
}

// Function to register the command with Commander
export function registerVideolinkCommand(program: Command) {
    program
        .command('video_link')
        .description('Rename/copy MKV files based on Anki note tokens and update a video field in Anki.')
        .requiredOption('-p, --path <folderPath>', 'Full path to the folder containing MKV files')
        .option('--deck <name>', `Target Anki deck name (default: "${DEFAULT_DECK_NAME}")`)
        .option('--anki-media-dir <mediaPath>', `Path to Anki's collection.media directory (default: "${DEFAULT_TARGET_COPY_DIR}")`)
        .option('--token-field <fieldName>', `Anki field name containing the token (default: "${TOKEN_FIELD_NAME}")`)
        .option('--video-field <fieldName>', `Anki field name to update with video link (default: "${TARGET_UPDATE_FIELD}")`)
        .action(async (options: VideolinkCommandOptions) => {
            try {
                await videolinkAction(options);
            } catch (error: any) {
                console.error(`\nError: ${error.message}`);
                process.exit(1); // Exit with a non-zero code on error
            }
        });
}
