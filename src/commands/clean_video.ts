import { Command } from 'commander';
import axios, { AxiosError } from 'axios';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline'; // Re-added readline for confirmation

// --- Configuration Constants ---
const ANKICONNECT_URL = 'http://127.0.0.1:8765';
const TARGET_ANKI_DECK_NAME = "Custom Study Session";
const VIDEO_FIELD_NAME = "Video"; // The field to check and clear
const DEFAULT_MEDIA_FOLDER = "D:\\AnkiData\\CGL\\collection.media";

// --- Type Definitions ---
interface AnkiConnectNoteInfo {
    noteId: number;
    tags: string[];
    fields: Record<string, { value: string; order: number }>;
    modelName: string;
    cards: number[];
}

interface AnkiConnectResponseBasic {
    result: any | null;
    error: string | null;
}

interface AnkiConnectNotesInfoResponse {
    result: AnkiConnectNoteInfo[] | null;
    error: string | null;
}

interface NoteToClean {
    noteId: number;
    originalVideoContent: string;
}

// --- Utility Functions ---
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Reinstated askQuestion for confirmation
function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => {
        rl.question(query, ans => {
            rl.close();
            resolve(ans.trim().toLowerCase());
        });
    });
}

/**
 * Extracts filenames from an Anki field value like "[sound:file1.mkv] text [sound:file2.mp4]".
 * @param fieldValue The string content of the Anki field.
 * @returns An array of extracted filenames.
 */
function extractFilenamesFromVideoField(fieldValue: string): string[] {
    if (!fieldValue || typeof fieldValue !== 'string') {
        return [];
    }
    const regex = /\[sound:(.*?)\]/g;
    const filenames: string[] = [];
    let match;
    while ((match = regex.exec(fieldValue)) !== null) {
        if (match[1]) {
            filenames.push(match[1]);
        }
    }
    return filenames;
}


// --- Core Logic Functions ---
async function fetchNotesFromAnki(deckName: string): Promise<AnkiConnectNoteInfo[]> {
    const payload = {
        action: "notesInfo",
        version: 6,
        params: {
            query: `deck:"${deckName}"`
        }
    };
    try {
        // console.log(chalk.gray(`Fetching notes from deck "${deckName}"...`)); 
        const response = await axios.post<AnkiConnectNotesInfoResponse>(ANKICONNECT_URL, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (response.data.error) {
            throw new Error(`AnkiConnect error (fetchNotes): ${response.data.error}. Deck: "${deckName}"`);
        }
        const notes = response.data.result || [];
        // console.log(chalk.gray(`Fetched ${notes.length} notes.`)); 
        return notes;
    } catch (error) {
        let errorMessage = `Failed to fetch notes from AnkiConnect for deck "${deckName}".`;
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNREFUSED') {
                errorMessage += ` Could not connect to ${ANKICONNECT_URL}. Ensure Anki is running and AnkiConnect is active.`;
            } else if (error.response) {
                errorMessage += ` HTTP Error: ${error.response.status} - ${error.response.statusText}.`;
                if (error.response.data?.error) errorMessage += ` AnkiConnect Message: ${error.response.data.error}`;
            } else if (error.request) {
                errorMessage += ` No response received.`;
            } else {
                errorMessage += ` Axios request error: ${error.message}`;
            }
        } else if (error instanceof Error) {
            errorMessage += ` Unexpected error: ${error.message}`;
        } else {
            errorMessage += ` An unknown error occurred.`;
        }
        console.error(chalk.red(errorMessage));
        throw error;
    }
}

async function updateAnkiNoteVideoField(noteId: number, newVideoContent: string): Promise<void> {
    const payload = {
        action: "updateNoteFields",
        version: 6,
        params: {
            note: {
                id: noteId,
                fields: {
                    [VIDEO_FIELD_NAME]: newVideoContent
                }
            }
        }
    };
    try {
        const response = await axios.post<AnkiConnectResponseBasic>(ANKICONNECT_URL, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (response.data.error) {
            throw new Error(`AnkiConnect error (updateNoteFields for note ${noteId}): ${response.data.error}`);
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
             if (error.code === 'ECONNREFUSED') {
                throw new Error(`Could not connect to AnkiConnect at ${ANKICONNECT_URL} while updating note ${noteId}.`);
            } else if (error.response?.data?.error) {
                 throw new Error(`AnkiConnect (updateNoteFields note ${noteId}): ${error.response.data.error}`);
            }
        }
        throw error; // Re-throw other errors
    }
}

async function deleteFile(filePath: string): Promise<{ status: 'deleted' | 'notFound' | 'failed'; error?: string }> {
    try {
        await fs.unlink(filePath);
        return { status: 'deleted' };
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return { status: 'notFound' };
        }
        return { status: 'failed', error: error.message };
    }
}

async function cleanVideoEntriesAction(mediaFolder: string): Promise<void> {
    console.log(chalk.blue(`Starting video field cleaning process...`));
    console.log(chalk.blue(`Target Deck: "${TARGET_ANKI_DECK_NAME}"`));
    console.log(chalk.blue(`Video Field: "${VIDEO_FIELD_NAME}"`));
    console.log(chalk.blue(`Media Folder for Deletion: "${mediaFolder}"`));
    
    let ankiNotes: AnkiConnectNoteInfo[];
    try {
        ankiNotes = await fetchNotesFromAnki(TARGET_ANKI_DECK_NAME);
    } catch (error) {
        console.error(chalk.red("Could not retrieve notes. Aborting cleanup."));
        process.exitCode = 1;
        return;
    }

    if (ankiNotes.length === 0) {
        console.log(chalk.yellow(`\nNo notes found in deck "${TARGET_ANKI_DECK_NAME}". Nothing to clean.`));
        return;
    }

    const notesToClean: NoteToClean[] = [];
    const allFilenamesToConsider = new Set<string>();

    for (const note of ankiNotes) {
        const videoFieldValue = note.fields[VIDEO_FIELD_NAME]?.value;
        if (videoFieldValue && videoFieldValue.trim() !== "") {
            notesToClean.push({ noteId: note.noteId, originalVideoContent: videoFieldValue });
            const extracted = extractFilenamesFromVideoField(videoFieldValue);
            extracted.forEach(filename => allFilenamesToConsider.add(filename));
        }
    }

    if (notesToClean.length === 0) {
        console.log(chalk.green(`\nNo notes found with a non-empty "${VIDEO_FIELD_NAME}" field. Nothing to clean.`));
        return;
    }

    console.log(chalk.magenta(`\nFound ${notesToClean.length} notes whose "${VIDEO_FIELD_NAME}" field will be cleared.`));
    
    if (allFilenamesToConsider.size > 0) {
        console.log(chalk.magenta(`The following ${allFilenamesToConsider.size} unique file(s) are referenced and will be targeted for deletion from "${mediaFolder}":`));
        allFilenamesToConsider.forEach(filename => console.log(chalk.gray(`  - ${filename}`)));
    } else {
        console.log(chalk.yellow(`No specific files were extracted from the "${VIDEO_FIELD_NAME}" fields to delete. Only fields will be cleared.`));
    }

    const confirmation = await askQuestion(chalk.yellow.bold(`\nAre you sure you want to proceed? This will clear ${notesToClean.length} Anki note field(s) and attempt to delete ${allFilenamesToConsider.size} file(s). (y/n): `));
    if (confirmation !== 'y') {
        console.log(chalk.red("Operation cancelled by user."));
        return;
    }
    
    console.log(chalk.blue("\nProceeding with Anki note field clearing..."));
    await delay(1000); 


    let fieldsClearedCount = 0;
    let fieldClearFailedCount = 0;

    for (let i = 0; i < notesToClean.length; i++) {
        const note = notesToClean[i];
        process.stdout.write(chalk.gray(`[${i + 1}/${notesToClean.length}] `)); 
        try {
            await updateAnkiNoteVideoField(note.noteId, "");
            process.stdout.write(chalk.green(`Cleared "${VIDEO_FIELD_NAME}" for note ${note.noteId}.\n`));
            fieldsClearedCount++;
        } catch (error: any) {
            process.stdout.write(chalk.red(`Failed to clear "${VIDEO_FIELD_NAME}" for note ${note.noteId}: ${error.message}\n`));
            fieldClearFailedCount++;
        }
        if (i < notesToClean.length -1) await delay(300); // <<<< INCREASED DELAY HERE
    }

    console.log(chalk.blue(`\nAnki field clearing phase complete. Fields cleared: ${fieldsClearedCount}, Failed: ${fieldClearFailedCount}.`));

    let filesDeletedCount = 0;
    let filesNotFoundCount = 0;
    let fileDeleteFailedCount = 0;

    if (allFilenamesToConsider.size > 0 && fieldClearFailedCount === 0) { 
        console.log(chalk.blue(`\nDeleting files from "${mediaFolder}"...`));
        const filenamesArray = Array.from(allFilenamesToConsider); 
        for (let i = 0; i < filenamesArray.length; i++) {
            const filename = filenamesArray[i];
            process.stdout.write(chalk.gray(`[${i + 1}/${filenamesArray.length}] `)); 
            const filePath = path.join(mediaFolder, filename);
            const result = await deleteFile(filePath);
            switch (result.status) {
                case 'deleted':
                    process.stdout.write(chalk.green(`Deleted: ${filename}\n`));
                    filesDeletedCount++;
                    break;
                case 'notFound':
                    process.stdout.write(chalk.yellow(`Not found (skipped): ${filename}\n`));
                    filesNotFoundCount++;
                    break;
                case 'failed':
                    process.stdout.write(chalk.red(`Failed to delete ${filename}: ${result.error}\n`));
                    fileDeleteFailedCount++;
                    break;
            }
            if (i < filenamesArray.length - 1) await delay(50); 
        }
        console.log(chalk.blue(`\nFile deletion phase complete. Deleted: ${filesDeletedCount}, Not Found: ${filesNotFoundCount}, Failed: ${fileDeleteFailedCount}.`));
    } else if (allFilenamesToConsider.size > 0 && fieldClearFailedCount > 0) {
        console.log(chalk.yellow(`\nSkipping file deletion due to errors during Anki field clearing.`));
    }


    console.log(chalk.green.bold("\n--- Cleanup Summary ---"));
    console.log(`Notes with non-empty "${VIDEO_FIELD_NAME}" field: ${notesToClean.length}`);
    console.log(`  Fields successfully cleared: ${fieldsClearedCount}`);
    console.log(`  Fields failed to clear: ${fieldClearFailedCount}`);
    if (allFilenamesToConsider.size > 0 || (notesToClean.length > 0 && allFilenamesToConsider.size === 0)) { 
        console.log(`Files referenced for deletion: ${allFilenamesToConsider.size}`);
        console.log(`  Files successfully deleted: ${filesDeletedCount}`);
        console.log(`  Files not found in media folder: ${filesNotFoundCount}`);
        console.log(`  Files failed to delete: ${fileDeleteFailedCount}`);
    }
    console.log(chalk.green.bold("\nProcess finished."));

     if (fieldClearFailedCount > 0 || fileDeleteFailedCount > 0) {
        process.exitCode = 1;
    }
}


// --- Command Registration ---
export function registerCleanVideoCommand(program: Command) {
    program
        .command('clean_video')
        .description(`Clears the "${VIDEO_FIELD_NAME}" field for notes in "${TARGET_ANKI_DECK_NAME}", lists referenced files, and then deletes them from the media folder after user confirmation.`)
        .option('-m, --media-folder <path>', 'Path to the Anki media folder where files will be deleted.', DEFAULT_MEDIA_FOLDER)
        .action(async (options) => {
            try {
                await cleanVideoEntriesAction(options.mediaFolder);
            } catch (error: any) {
                console.error(chalk.red(`\n❌ An unexpected error occurred during the clean_video command:`));
                console.error(chalk.red(error.message || error));
                process.exitCode = 1; 
            }
        });
}