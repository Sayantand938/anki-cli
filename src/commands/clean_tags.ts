// // clean_tags.ts

// import { Command } from 'commander';
// import axios, { AxiosError } from 'axios';
// import fs from 'fs/promises'; // Included for consistency, though not directly used for writing output files
// import { readFileSync } from 'fs';
// import path from 'path';
// import envPaths from 'env-paths';

// // --- Configuration Constants ---
// const ANKICONNECT_URL = 'http://127.0.0.1:8765';
// const TARGET_ANKI_DECK_NAME = "Custom Study Session";
// const VALID_SUBJECTS: ReadonlySet<string> = new Set(["GK", "GI", "MATH", "ENG"]);

// // --- Type Definitions ---
// interface AnkiConnectNoteInfo {
//     noteId: number;
//     tags: string[];
//     fields: Record<string, { value: string; order: number }>; // Kept for structural similarity
//     modelName: string;
//     cards: number[];
// }

// interface AnkiConnectResponse {
//     result: AnkiConnectNoteInfo[] | null;
//     error: string | null;
// }

// interface NoteWithValidTags {
//     noteId: number;
//     validTags: string[];
// }

// // --- Utility Functions ---
// /**
//  * Determines the application name from package.json or provides a default.
//  * @returns The application name.
//  */
// const getAppNameFromPackageJson = (): string => {
//     try {
//         const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
//         const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
//         const packageJson = JSON.parse(packageJsonContent);
//         if (packageJson && typeof packageJson.name === 'string' && packageJson.name.trim() !== '') {
//             return packageJson.name;
//         }
//         return 'anki-cli-tool-default'; // A general default or a more specific one
//     } catch (error) {
//         return 'anki-cli-tool-default';
//     }
// };

// const APP_NAME = getAppNameFromPackageJson();
// const applicationPaths = envPaths(APP_NAME, { suffix: '' });
// // const DATA_DIR = applicationPaths.data; // Kept for consistency, not used in this script

// // --- Core Logic Functions ---
// /**
//  * Fetches notes from AnkiConnect for a specific deck.
//  * @param deckName The name of the Anki deck to query.
//  * @returns A Promise resolving to an array of AnkiConnectNoteInfo.
//  * @throws AxiosError if the HTTP request fails, or Error if AnkiConnect returns an error.
//  */
// async function fetchNotesFromAnki(deckName: string): Promise<AnkiConnectNoteInfo[]> {
//     const payload = {
//         action: "notesInfo",
//         version: 6,
//         params: {
//             query: `deck:"${deckName}"`
//         }
//     };
//     try {
//         const response = await axios.post<AnkiConnectResponse>(ANKICONNECT_URL, payload, {
//             headers: { 'Content-Type': 'application/json' }
//         });
//         if (response.data.error) {
//             throw new Error(`AnkiConnect error: ${response.data.error}. Ensure Anki is running, AnkiConnect is installed, and the deck "${deckName}" exists.`);
//         }
//         return response.data.result || [];
//     } catch (error) {
//         if (axios.isAxiosError(error)) {
//             if (error.code === 'ECONNREFUSED') {
//                 console.error(`Could not connect to AnkiConnect at ${ANKICONNECT_URL}.`);
//                 console.error('Ensure Anki is running and AnkiConnect is active.');
//             } else if (error.response) {
//                 console.error(`HTTP Error from AnkiConnect: ${error.response.status} - ${error.response.statusText}`);
//                 if (error.response.data?.error) {
//                     console.error(`AnkiConnect Message: ${error.response.data.error}`);
//                 } else if (error.response.data) {
//                     console.error('AnkiConnect Response Data:', error.response.data);
//                 }
//             } else if (error.request) {
//                 console.error(`No response received from AnkiConnect.`);
//             } else {
//                 console.error(`Axios request error: ${error.message}`);
//             }
//             throw error;
//         } else {
//             console.error(`An unexpected error occurred during AnkiConnect communication: ${error}`);
//             throw error;
//         }
//     }
// }

// /**
//  * Filters tags to include only those matching "Subject::Topic" format with valid subjects.
//  * @param tags An array of tag strings.
//  * @returns An array of valid tag strings.
//  */
// function filterValidTags(tags: string[]): string[] {
//     return tags.filter(tag => {
//         const parts = tag.split('::');
//         if (parts.length === 2) { // Ensures "Subject::Topic" structure, not "Subject" or "Subject::Topic::Subtopic"
//             const subject = parts[0];
//             return VALID_SUBJECTS.has(subject);
//         }
//         return false;
//     });
// }

// // --- Command Registration ---
// /**
//  * Registers the 'clean_tags' command with the Commander program.
//  * @param program The Commander program instance.
//  */
// export function registerCleanTagsCommand(program: Command) {
//     program
//         .command('clean_tags')
//         .description(`Lists note IDs and their valid Subject::Topic tags from the "${TARGET_ANKI_DECK_NAME}" deck.`)
//         .action(async () => {
//             console.log('Starting tag cleaning and listing process...');
//             console.log(`Target Deck: "${TARGET_ANKI_DECK_NAME}"`);
//             console.log(`Valid Subjects: ${Array.from(VALID_SUBJECTS).join(', ')}`);
//             console.log('---');

//             let processedNotesCount = 0;
//             let notesWithValidTagsCount = 0;

//             try {
//                 const ankiNotes = await fetchNotesFromAnki(TARGET_ANKI_DECK_NAME);
//                 processedNotesCount = ankiNotes.length;

//                 if (ankiNotes.length === 0) {
//                     console.warn(`No notes found in deck "${TARGET_ANKI_DECK_NAME}".`);
//                     console.log('---');
//                     console.log(`Total notes processed: 0`);
//                     console.log(`Notes with valid Subject::Topic tags: 0`);
//                     console.log(`Status: ✅`);
//                     return;
//                 }

//                 const notesToDisplay: NoteWithValidTags[] = [];

//                 for (const note of ankiNotes) {
//                     const validTags = filterValidTags(note.tags);
//                     if (validTags.length > 0) {
//                         notesWithValidTagsCount++;
//                         notesToDisplay.push({ noteId: note.noteId, validTags });
//                     }
//                 }

//                 if (notesToDisplay.length > 0) {
//                     console.log("Notes with valid Subject::Topic tags:\n");
//                     notesToDisplay.forEach(note => {
//                         console.log(`Note ID: ${note.noteId}`);
//                         console.log(`  Tags:`);
//                         note.validTags.forEach(tag => {
//                             console.log(`    - ${tag}`);
//                         });
//                         console.log(''); // Add a blank line for readability between notes
//                     });
//                 } else {
//                     console.log("No notes found with tags matching the specified Subject::Topic format.");
//                 }

//                 console.log('---');
//                 console.log(`Total notes processed in deck: ${processedNotesCount}`);
//                 console.log(`Notes with valid Subject::Topic tags: ${notesWithValidTagsCount}`);
//                 console.log(`Status: ✅`);

//             } catch (error) {
//                 console.error(`\nTag cleaning process failed.`);
//                 if (error instanceof Error) {
//                     console.error(`Error details: ${error.message}`);
//                 } else {
//                     console.error(`An unknown error occurred.`);
//                 }
//                 console.log('---');
//                 console.log(`Total notes processed before error: ${processedNotesCount}`);
//                 console.log(`Notes with valid Subject::Topic tags found: ${notesWithValidTagsCount}`);
//                 console.log(`Status: ❌`);
//                 process.exit(1);
//             }
//         });
// }


// clean_tags.ts

import { Command } from 'commander';
import axios, { AxiosError } from 'axios';
import { readFileSync } from 'fs';
import path from 'path';
import envPaths from 'env-paths';
// readline is no longer needed as we are removing the confirmation prompt

// --- Configuration Constants ---
const ANKICONNECT_URL = 'http://127.0.0.1:8765';
const TARGET_ANKI_DECK_NAME = "Custom Study Session";
const VALID_SUBJECTS: ReadonlySet<string> = new Set(["GK", "GI", "MATH", "ENG"]);
const DELAY_MS = 1000; // 1 second delay between AnkiConnect calls

// --- Type Definitions ---
interface AnkiConnectNoteInfo {
    noteId: number;
    tags: string[];
    fields: Record<string, { value: string; order: number }>;
    modelName: string;
    cards: number[];
}

interface AnkiConnectResponseBasic { // For actions like replaceTags
    result: any | null;
    error: string | null;
}

interface AnkiConnectNotesInfoResponse { // For notesInfo action
    result: AnkiConnectNoteInfo[] | null;
    error: string | null;
}

interface TagReplacementOperation {
    noteId: number;
    originalTag: string; // e.g., "GK::History"
    newTag: string;      // e.g., "GK"
}

// --- Utility Functions ---
const getAppNameFromPackageJson = (): string => {
    try {
        const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
        const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);
        if (packageJson && typeof packageJson.name === 'string' && packageJson.name.trim() !== '') {
            return packageJson.name;
        }
        return 'anki-tag-tool-default';
    } catch (error) {
        return 'anki-tag-tool-default';
    }
};

const APP_NAME = getAppNameFromPackageJson();
// const applicationPaths = envPaths(APP_NAME, { suffix: '' }); // Not writing files

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Core Logic Functions ---
async function fetchNotesFromAnki(deckName: string): Promise<AnkiConnectNoteInfo[]> {
    const payload = {
        action: "notesInfo",
        version: 6,
        params: { query: `deck:"${deckName}"` }
    };
    try {
        const response = await axios.post<AnkiConnectNotesInfoResponse>(ANKICONNECT_URL, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (response.data.error) {
            throw new Error(`AnkiConnect error (fetchNotes): ${response.data.error}. Deck: "${deckName}"`);
        }
        return response.data.result || [];
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
        console.error(errorMessage);
        throw error;
    }
}

function identifyTagsToSimplify(notes: AnkiConnectNoteInfo[]): TagReplacementOperation[] {
    const operations: TagReplacementOperation[] = [];
    for (const note of notes) {
        for (const tag of note.tags) {
            const parts = tag.split('::');
            if (parts.length === 2) {
                const subject = parts[0];
                const topic = parts[1];
                if (VALID_SUBJECTS.has(subject) && topic.trim() !== '') {
                    if (tag !== subject) { // Ensure we are actually changing something
                         operations.push({
                            noteId: note.noteId,
                            originalTag: tag,
                            newTag: subject
                        });
                    }
                }
            }
        }
    }
    return operations;
}

async function replaceAnkiTagInNote(noteId: number, tagToReplace: string, newTag: string): Promise<void> {
    if (tagToReplace === newTag) {
        return; // Should be caught by identifyTagsToSimplify, but safety first
    }

    const payload = {
        action: "replaceTags",
        version: 6,
        params: {
            notes: [noteId],
            tag_to_replace: tagToReplace,
            replace_with_tag: newTag
        }
    };

    try {
        const response = await axios.post<AnkiConnectResponseBasic>(ANKICONNECT_URL, payload, {
            headers: { 'Content-Type': 'application/json' },
        });

        if (response.data && response.data.error) {
            console.error(`\nAnkiConnect error during tag replacement for note ${noteId} (replacing '${tagToReplace}' with '${newTag}'): ${response.data.error}`);
            throw new Error(`AnkiConnect error (replaceTags): ${response.data.error}`);
        }
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.data?.error) {
            // Error already logged
        } else if (axios.isAxiosError(error)) {
            let subErrorMessage = `\nFailed to replace tag for note ${noteId} ('${tagToReplace}' -> '${newTag}').`;
            if (error.code === 'ECONNREFUSED') subErrorMessage += ` Could not connect to ${ANKICONNECT_URL}.`;
            else if (error.response) subErrorMessage += ` HTTP Error: ${error.response.status} - ${error.response.statusText}.`;
            else if (error.request) subErrorMessage += ` No response received.`;
            else subErrorMessage += ` Axios request error: ${error.message}`;
            console.error(subErrorMessage);
        } else if (error instanceof Error && error.message.startsWith('AnkiConnect error (replaceTags):')) {
            // Already logged
        } else {
            console.error(`\nAn unexpected error occurred during tag replacement for note ${noteId} ('${tagToReplace}' -> '${newTag}'): ${error}`);
        }
        throw error;
    }
}

async function processTagReplacements(operations: TagReplacementOperation[]): Promise<{ successCount: number; failureCount: number; skippedCount: number }> {
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0; // For cases where originalTag === newTag (should be minimal)
    const totalOperations = operations.length;

    if (totalOperations > 0) {
        console.log(`\nIdentified ${totalOperations} tag simplification(s). Starting process...`);
        // Initial delay before starting the loop if there are operations
        await delay(1500);
    }


    for (let i = 0; i < totalOperations; i++) {
        const op = operations[i];
        const { noteId, originalTag, newTag } = op;
        const entryIndex = i + 1;

        if (originalTag === newTag) {
            process.stdout.write(`[${entryIndex}/${totalOperations}] noteid:${noteId} tag '${originalTag}' is already simplified. Skipped.\n`);
            skippedCount++;
            continue;
        }

        try {
            process.stdout.write(`[${entryIndex}/${totalOperations}] noteid:${noteId} replacing '${originalTag}' with '${newTag}'... `);
            await replaceAnkiTagInNote(noteId, originalTag, newTag);
            process.stdout.write("Success\n");
            successCount++;
        } catch (error) {
            process.stdout.write("Failed\n");
            failureCount++;
        }

        if (i < totalOperations - 1) {
            await delay(DELAY_MS);
        }
    }
    return { successCount, failureCount, skippedCount };
}

// --- Command Registration ---
export function registerCleanTagsCommand(program: Command) {
    program
        .command('clean_tags')
        .description(`Simplifies Subject::Topic tags to Subject (e.g., GK::History to GK) for all notes in the "${TARGET_ANKI_DECK_NAME}" deck. This operation is performed directly without confirmation.`)
        // .option('-y, --yes', ...) REMOVED
        .action(async (options) => { // options argument is still passed but not used for --yes
            console.log('Starting Anki tag simplification process...');
            console.log(`Target Deck: "${TARGET_ANKI_DECK_NAME}"`);
            console.log(`Valid Subjects: ${Array.from(VALID_SUBJECTS).join(', ')}`);            
            console.log('---');

            let ankiNotes: AnkiConnectNoteInfo[] = [];
            try {
                // Short delay to allow user to read the warning
                await delay(2500);

                ankiNotes = await fetchNotesFromAnki(TARGET_ANKI_DECK_NAME);
                if (ankiNotes.length === 0) {
                    console.warn(`No notes found in deck "${TARGET_ANKI_DECK_NAME}". Nothing to simplify.`);
                    console.log("Status: ✅");
                    return;
                }

                const operations = identifyTagsToSimplify(ankiNotes);

                if (operations.length === 0) {
                    console.log("No tags found matching the Subject::Topic format for simplification.");
                    console.log(`Total notes scanned in deck: ${ankiNotes.length}`);
                    console.log("Status: ✅");
                    return;
                }

                // No confirmation block here, proceed directly
                const { successCount, failureCount, skippedCount } = await processTagReplacements(operations);

                console.log("\n--- Tag Simplification Summary ---");
                console.log(`Total notes scanned: ${ankiNotes.length}`);
                console.log(`Total operations identified: ${operations.length}`);
                console.log(`Successful replacements: ${successCount}`);
                if (skippedCount > 0) console.log(`Skipped (already simplified/no change needed): ${skippedCount}`);
                console.log(`Failed replacements: ${failureCount}`);

                if (failureCount > 0) {
                    console.log("Status: ⚠️ Some operations failed. Please review logs above.");
                } else if (successCount === 0 && operations.length > 0 && skippedCount < operations.length) {
                    console.log("Status: ⚠️ No tags were successfully simplified, though operations were attempted.");
                } else {
                    console.log("Status: ✅");
                }

            } catch (error: any) {
                console.error("\nTag simplification process failed critically.");
                if (error instanceof Error && !error.message.includes('AnkiConnect error (fetchNotes)')) {
                     console.error(`Error details: ${error.message}`);
                } else if (!axios.isAxiosError(error) && !(error instanceof Error && error.message.includes('AnkiConnect error'))) {
                     console.error(`An unknown error occurred: ${error}`);
                }
                console.log("Status: ❌");
                process.exit(1);
            }
        });
}