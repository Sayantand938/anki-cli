// --- START OF FILE tag_check.ts ---
import { Command } from 'commander';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import axios, { AxiosError } from 'axios';
import envPaths from 'env-paths';
import readline from 'readline';
import chalk from 'chalk'; // Import chalk

const ANKICONNECT_URL = 'http://127.0.0.1:8765';

interface SuggestedEntry { // Renamed from AuditEntry
    noteId: number;
    currentTag: string;
    suggestedTag: string;
}

interface InputNote {
    noteId: number;
    Question: string;
    [key: string]: any;
}

const getAppNameFromPackageJson = (): string => {
    try {
        const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
        const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);
        if (packageJson && typeof packageJson.name === 'string' && packageJson.name.trim() !== '') {
            return packageJson.name;
        }
        return 'anki-tag-checker-default';
    } catch (error) {
        return 'anki-tag-checker-default';
    }
};

const APP_NAME = getAppNameFromPackageJson();
const applicationPaths = envPaths(APP_NAME, { suffix: '' });
const DATA_DIR = applicationPaths.data;
const INPUT_FILE = path.join(DATA_DIR, 'input.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'output.json');

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => {
        rl.question(query, ans => {
            rl.close();
            resolve(ans);
        });
    });
}

async function readSuggestedEntries(filePath: string): Promise<SuggestedEntry[]> { // Renamed from readAuditEntries
    await fs.mkdir(DATA_DIR, { recursive: true });
    const data = await fs.readFile(filePath, 'utf-8');
    const entries: SuggestedEntry[] = JSON.parse(data);
    return entries;
}

async function readInputNotes(filePath: string): Promise<InputNote[]> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const data = await fs.readFile(filePath, 'utf-8');
    const notes: InputNote[] = JSON.parse(data);
    return notes;
}

function findMismatchedEntries(entries: SuggestedEntry[]): SuggestedEntry[] { // Type updated
    return entries.filter(entry => entry.currentTag !== entry.suggestedTag);
}

function getQuestionForNote(noteId: number, inputNotes: InputNote[]): string {
    const note = inputNotes.find(n => n.noteId === noteId);
    return note?.Question ?? `[Question not found for noteId ${noteId}]`;
}

function isValidTagString(tag: string): boolean {
    return tag !== '' && tag.split('::').length >= 2;
}

// CHANGED THIS FUNCTION TO REPLACE ENTIRE TAG
async function updateAnkiNoteTags(noteId: number, currentTag: string, newTag: string): Promise<void> {
    if (!isValidTagString(newTag)) {
        throw new Error(`Invalid new tag format "${newTag}". Must contain '::'.`);
    }

    const payload = {
        action: "replaceTags",
        version: 6,
        params: {
            notes: [noteId],
            tag_to_replace: currentTag,  // ← Entire current tag
            replace_with_tag: newTag     // ← Entire new tag
        }
    };

    try {
        const response = await axios.post(ANKICONNECT_URL, payload, {
            headers: { 'Content-Type': 'application/json' },
        });

        if (response.data && response.data.error) {
            throw new Error(`AnkiConnect error for note ${noteId} (replaceTags): ${response.data.error}`);
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNREFUSED') {
                console.error(`Could not connect to AnkiConnect at ${ANKICONNECT_URL}. Ensure Anki is running and AnkiConnect is active.`);
            } else if (error.response) {
                console.error(`HTTP Error from AnkiConnect for note ${noteId}: ${error.response.status} - ${error.response.statusText}`);
                if (error.response.data?.error) {
                    console.error(`AnkiConnect Message: ${error.response.data.error}`);
                } else if (error.response.data) {
                    console.error('AnkiConnect Response Data:', error.response.data);
                }
            } else if (error.request) {
                console.error(`No response received from AnkiConnect for note ${noteId}.`);
            } else {
                console.error(`Axios request error for note ${noteId}: ${error.message}`);
            }
            throw error;
        } else {
            console.error(`An unexpected error occurred during AnkiConnect communication for note ${noteId}: ${error}`);
            throw error;
        }
    }
}

async function processTagMismatches(mismatchedEntries: SuggestedEntry[], inputNotes: InputNote[]): Promise<{ updatedCount: number; skippedCount: number; failedCount: number }> { // Type updated
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < mismatchedEntries.length; i++) {
        const entry = mismatchedEntries[i];
        const { noteId, currentTag, suggestedTag } = entry;
        const entryIndex = i + 1;
        const question = getQuestionForNote(noteId, inputNotes);

        console.log(`\n--- Note ${entryIndex}/${mismatchedEntries.length} ---`);
        // Use chalk for coloring only the headers and add line breaks
        console.log(`\n${chalk.cyan('Note ID:')} ${noteId}`);
        console.log(`\n${chalk.yellow('Question :')} ${question}`);
        console.log(`\n${chalk.magenta('Current Tag:')} ${currentTag}`);
        console.log(`\n${chalk.green('Suggested Tag:')} ${suggestedTag}`);

        if (!isValidTagString(suggestedTag)) {
            console.log(chalk.red(`\nSkipped noteid:${noteId}: Suggested Tag "${suggestedTag}" has invalid format (missing '::').`));
            skippedCount++;
            continue;
        }

        const answer = await askQuestion(chalk.blue('\nConfirmation (y/n/s - skip remaining): '));
        const lowerAnswer = answer.trim().toLowerCase();

        if (lowerAnswer === 'y') {
            try {
                await updateAnkiNoteTags(noteId, currentTag, suggestedTag);
                console.log(chalk.green(`\nnoteid:${noteId} updated.`));
                updatedCount++;
            } catch (error) {
                console.error(chalk.red(`\nnoteid:${noteId} failed to update.`));
                failedCount++;
            }
        } else if (lowerAnswer === 's') {
            console.log(chalk.yellow('\nSkipping remaining entries.'));
            skippedCount += (mismatchedEntries.length - entryIndex);
            break;
        } else {
            console.log(chalk.yellow(`\nnoteid:${noteId} skipped.`));
            skippedCount++;
        }

        if (i < mismatchedEntries.length - 1 && lowerAnswer !== 's') {
            await delay(1000);
        }
    }

    return { updatedCount, skippedCount, failedCount };
}

export async function registerTagCheckCommand(program: Command) {
    program
        .command('tag_check')
        .description('Reads output.json, finds tag mismatches, prompts user, and updates Anki tags')
        .action(async () => {
            console.log('Starting Anki tag check and update process...');
            console.log(`Output File (Suggested): "${path.basename(OUTPUT_FILE)}"`); // Renamed comment
            console.log(`Input File (Notes): "${path.basename(INPUT_FILE)}"`);

            try {
                await delay(3000);
                console.log("Reading input and output files...");

                const suggestedEntries = await readSuggestedEntries(OUTPUT_FILE); // Renamed function call
                const inputNotes = await readInputNotes(INPUT_FILE);

                if (suggestedEntries.length === 0) {
                    console.warn(`No entries found in "${path.basename(OUTPUT_FILE)}". Nothing to check.`);
                    console.log("Status: ✅");
                    return;
                }

                if (inputNotes.length === 0) {
                    console.warn(`No notes found in "${path.basename(INPUT_FILE)}". Cannot retrieve Question context.`);
                    console.log("Status: ❌ Process requires notes from input.json.");
                    process.exit(1);
                }

                const mismatchedEntries = findMismatchedEntries(suggestedEntries); // Type updated

                if (mismatchedEntries.length === 0) {
                    console.log("No tag mismatches found in output.json. All tags match suggested tags."); // Renamed comment
                    console.log("Status: ✅");
                    return;
                }

                console.log(`Found ${mismatchedEntries.length} potential tag mismatches.`);

                const { updatedCount, skippedCount, failedCount } = await processTagMismatches(mismatchedEntries, inputNotes);

                console.log('\n--- Process Summary ---');
                console.log(`Total Mismatches Found: ${mismatchedEntries.length}`);
                console.log(`Updated: ${updatedCount}`);
                console.log(`Skipped: ${skippedCount}`);
                console.log(`Failed to Update: ${failedCount}`);

                if (failedCount > 0) {
                    console.log("Status: ⚠️  (Some updates failed)");
                    process.exit(1);
                } else {
                    console.log("Status: ✅");
                }

            } catch (error: any) {
                console.error("\nTag check and update process failed.");
                console.log("Status: ❌");

                if (error.code === 'ENOENT') {
                    console.error(`File not found: ${error.path}`);
                    if (error.path === OUTPUT_FILE) {
                        console.error(`Please ensure "${path.basename(OUTPUT_FILE)}" exists. You might need to run a command that generates this file (e.g., 'process_with_gemini').`);
                    } else if (error.path === INPUT_FILE) {
                        console.error(`Please ensure "${path.basename(INPUT_FILE)}" exists. You might need to run the 'export_notes' command first.`);
                    }
                } else if (error.name === 'SyntaxError') {
                    console.error('Failed to parse a JSON file:', error.message);
                    console.error(`Please ensure "${path.basename(OUTPUT_FILE)}" and "${path.basename(INPUT_FILE)}" contain valid JSON.`);
                } else if (error instanceof Error) {
                    console.error(`Error details: ${error.message}`);
                } else {
                    console.error(`An unknown error occurred.`);
                }

                process.exit(1);
            }
        });
}
// --- END OF FILE tag_check.ts ---


