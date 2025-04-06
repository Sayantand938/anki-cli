// src/commands/fetch.ts
import type { Command } from "commander";
import axios from "axios";
import chalk from "chalk";
import { prompt } from 'enquirer';
import clipboardy from 'clipboardy';

// --- Configuration ---
const ANKICONNECT_URL = "http://127.0.0.1:8765";
const TARGET_DECK_NAME = "Custom Study Session";
const ANKICONNECT_VERSION = 6;
const DEFAULT_TAG_PREFIX = "Prelims";
const NUMBER_REGEX = /^\d+$/;
const DEFAULT_NUM_QUESTIONS = 50;

// --- Define expected answer shape ---
interface FetchAnswers {
    startNumberStr: string;
    endNumberStr: string;
    numQuestions: number;
}

// --- Helper Functions ---

/** Generates a list of tags within a numerical range using a fixed prefix */
function generateTagRange(prefix: string, startNumber: number, endNumber: number): string[] {
    const tags: string[] = [];
    for (let i = startNumber; i <= endNumber; i++) {
        tags.push(`${prefix}-${i}`);
    }
    return tags;
}

/**
 * Shuffles array in place using Fisher-Yates algorithm.
 * @param array Array to shuffle.
 */
function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap elements
    }
    return array;
}


// --- AnkiConnect API Call ---
async function findNotesByTags(deckName: string, tags: string[]): Promise<number[]> {
    if (tags.length === 0) {
        console.warn(chalk.yellow("Warning: No tags provided to filter by."));
        return [];
    }
    const tagQueryPart = tags.map(tag => `tag:"${tag}"`).join(" OR ");
    const finalQuery = `deck:"${deckName}" (${tagQueryPart})`;
    const payload = { action: "findNotes", version: ANKICONNECT_VERSION, params: { query: finalQuery } };
    try {
        // console.log(chalk.blue(`🔍 Querying AnkiConnect...`)); // Reduced verbosity
        // console.log(chalk.gray(`   Deck: "${deckName}"`)); // Reduced verbosity
        // console.log(chalk.gray(`   Tags: ${tags.join(', ')}`)); // Reduced verbosity
        const response = await axios.post(ANKICONNECT_URL, payload);
        if (response.data.error) throw new Error(`AnkiConnect Error: ${response.data.error}`);
        if (!Array.isArray(response.data.result)) throw new Error(`AnkiConnect Error: Unexpected response format.`);
        // console.log(chalk.cyan(`➡️ Received response from AnkiConnect.`)); // Reduced verbosity
        return response.data.result as number[];
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNREFUSED') console.error(chalk.red(`❌ Error: Connection refused. Is Anki open and AnkiConnect installed/running on ${ANKICONNECT_URL}?`));
            else console.error(chalk.red(`❌ Axios Error: ${error.message}`));
        } else console.error(chalk.red(`❌ Error: ${error.message}`));
        throw new Error(`Failed to fetch notes matching tags [${tags.join(', ')}] in deck "${deckName}".`);
    }
}


// --- Command Action Handler ---
async function handleFetchCommand() {
    try {
        const answers: FetchAnswers = await prompt([
            {
                type: 'input',
                name: 'startNumberStr',
                message: `Enter starting tag number (prefix "${DEFAULT_TAG_PREFIX}"):`,
                validate(value: string) {
                    return NUMBER_REGEX.test(value) ? true : 'Please enter a valid number.';
                }
            },
            {
                type: 'input',
                name: 'endNumberStr',
                message: `Enter ending tag number (prefix "${DEFAULT_TAG_PREFIX}"):`,
                 validate(value: string) {
                     return NUMBER_REGEX.test(value) ? true : 'Please enter a valid number.';
                 }
            },
            {
                type: 'numeral',
                name: 'numQuestions',
                message: 'Enter total no of questions to select:',
                initial: DEFAULT_NUM_QUESTIONS,
                validate(value: string) {
                    const num = Number(value);
                    if (!isNaN(num) && num > 0) {
                        return true;
                    }
                    return 'Please enter a number greater than 0.';
                }
            }
        ]);

        const startNumber = parseInt(answers.startNumberStr, 10);
        const endNumber = parseInt(answers.endNumberStr, 10);
        const numQuestionsToSelect = answers.numQuestions;

        if (isNaN(startNumber) || isNaN(endNumber)) {
            throw new Error("Invalid number input received for tags.");
        }
        if (startNumber > endNumber) {
            throw new Error(`Starting tag number (${startNumber}) cannot be greater than ending tag number (${endNumber}).`);
        }

        const tagsToSearch = generateTagRange(DEFAULT_TAG_PREFIX, startNumber, endNumber);
        const allNoteIds = await findNotesByTags(TARGET_DECK_NAME, tagsToSearch);

        if (allNoteIds.length === 0) {
            console.log(chalk.yellow(`\n⚠️ No notes found in deck "${TARGET_DECK_NAME}" matching tags in the range ${DEFAULT_TAG_PREFIX}-${startNumber} to ${DEFAULT_TAG_PREFIX}-${endNumber}.`));
        } else {
            // --- Modified Output ---
            console.log(chalk.blue(`🔎 ${allNoteIds.length} notes matching the tag range.`));

            const countToSelect = Math.min(allNoteIds.length, numQuestionsToSelect);
            // console.log(chalk.blue(`Selecting ${countToSelect} random notes...`)); // Removed this line

            const shuffledIds = shuffleArray([...allNoteIds]);
            const selectedNoteIds = shuffledIds.slice(0, countToSelect);

            const clipboardString = selectedNoteIds.map(id => `nid:${id}`).join(' OR ');

            await clipboardy.write(clipboardString);

            console.log(chalk.green(`✅ Selected ${selectedNoteIds.length} random notes.`));
            console.log(chalk.cyan(`📋 Copied Anki search query for selected notes to clipboard`));
            // Removed snippet log line
            // --- End Modified Output ---
        }
        process.exitCode = 0;

    } catch (error: any) {
         if (typeof error === 'string' && error === '') {
             console.log(chalk.yellow('\nOperation cancelled by user.'));
             process.exitCode = 0;
         } else if (error instanceof Error) {
             if (error.message.startsWith("Starting tag number")) {
                 console.error(chalk.red(`❌ Validation Error: ${error.message}`));
             } else {
                 console.error(chalk.red(`\n--- Operation Failed ---`));
                 console.error(chalk.red(error.message));
             }
             process.exitCode = 1;
         } else if (error) {
             console.error(chalk.red(`\n--- Operation Failed ---`));
             console.error(chalk.red('An unexpected error occurred during prompting.'));
             console.error(error);
             process.exitCode = 1;
         } else {
             console.log(chalk.yellow('\nOperation cancelled or failed during prompt.'));
             process.exitCode = 1;
         }
    }
}

// --- Register Command with Commander ---
export function registerFetchCommand(program: Command): void {
    program
        .command("fetch")
        .description(`Fetches notes from "${TARGET_DECK_NAME}" by tag range (prefix "${DEFAULT_TAG_PREFIX}-"), selects randomly, copies query to clipboard.`)
        .action(handleFetchCommand);
}