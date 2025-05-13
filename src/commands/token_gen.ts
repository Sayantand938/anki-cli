import axios, { AxiosError } from 'axios';
import { Command } from 'commander'; // Ensure Commander's Command type is imported

// --- Configuration ---
const ANKI_CONNECT_URL = 'http://localhost:8765';
const DEFAULT_TARGET_DECK_NAME = 'Custom Study Session'; // Default if not provided by CLI
const ANKI_CONNECT_VERSION = 6;
const KNOWN_SUBJECTS = ['MATH', 'GI', 'ENG', 'GK'];
const SUBJECT_SEPARATOR = '::';
const SL_PADDING = 3;

const SUBJECT_CODE_MAP: Record<string, string> = {
    'MATH': '01',
    'GI':   '02',
    'ENG':  '03',
    'GK':   '04',
    'Unknown': 'XX'
};

const EXAM_TAG_INFO: Record<string, { tierCode: string }> = {
    'Prelims::': { tierCode: '01' },
    'Mains::':   { tierCode: '02' }
};

const EXAM_TAG_PREFIXES = Object.keys(EXAM_TAG_INFO);
const DEFAULT_TIER = 'XX';
const DEFAULT_SHIFT = '---';
// --- End Configuration ---

// --- Type Definitions ---
interface AnkiNoteInfo {
    noteId: number;
    tags: string[];
    fields: Record<string, { value: string, order: number }>; // Example structure
    // Add other fields if notesInfo returns more that you use
}

interface TokenMapping {
    noteId: number;
    tokenNo: string;
}

// Interface for options passed by Commander.js
export interface TokengenCommandOptions {
    deck?: string; // Optional deck name from CLI
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function invokeAnkiConnect(action: string, params: Record<string, any> = {}): Promise<any> {
    try {
        const response = await axios.post(ANKI_CONNECT_URL, {
            action,
            version: ANKI_CONNECT_VERSION,
            params,
        });
        if (response.data.error) {
            throw new Error(`AnkiConnect Error: ${response.data.error}`);
        }
        return response.data.result;
    } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
            throw new Error(`AnkiConnect request failed: ${axiosError.message} (Status: ${axiosError.response.status}, Data: ${JSON.stringify(axiosError.response.data)})`);
        } else if (axiosError.request) {
            throw new Error(`Could not connect to AnkiConnect at ${ANKI_CONNECT_URL}. Is Anki running with AnkiConnect installed?`);
        } else {
            // For other errors (e.g., network issues before request is made, or errors in promise setup)
            throw new Error(`Failed to send AnkiConnect request: ${axiosError.message}`);
        }
    }
}

function extractSubjectFromTags(tags: string[]): string {
    for (const tag of tags) {
        if (tag.includes(SUBJECT_SEPARATOR)) {
            const potentialSubject = tag.split(SUBJECT_SEPARATOR)[0].toUpperCase();
            if (KNOWN_SUBJECTS.includes(potentialSubject)) {
                return potentialSubject;
            }
        }
    }
    return 'Unknown';
}

function extractExamDetails(tags: string[]): { tierCode: string; shiftValue: string } {
    for (const tag of tags) {
        for (const prefix of EXAM_TAG_PREFIXES) {
            if (tag.startsWith(prefix)) {
                const value = tag.substring(prefix.length);
                if (/^\d+$/.test(value)) {
                    return {
                        tierCode: EXAM_TAG_INFO[prefix].tierCode,
                        shiftValue: value
                    };
                }
            }
        }
    }
    return { tierCode: DEFAULT_TIER, shiftValue: DEFAULT_SHIFT };
}

async function buildTokenNoMapping(deckName: string): Promise<TokenMapping[]> {
    const mapping: TokenMapping[] = [];

    console.log(`Fetching notes from deck: "${deckName}"...`);
    const notes: AnkiNoteInfo[] = await invokeAnkiConnect('notesInfo', {
        query: `deck:"${deckName}"`
    });

    if (!notes || notes.length === 0) {
        console.log(`No notes found in deck "${deckName}".`);
        return mapping;
    }
    console.log(`Found ${notes.length} notes.`);

    const subjectCounters: Record<string, number> = {};
    KNOWN_SUBJECTS.forEach(s => subjectCounters[s] = 0);
    subjectCounters['Unknown'] = 0;

    for (const note of notes) {
        const subject = extractSubjectFromTags(note.tags);
        subjectCounters[subject] = (subjectCounters[subject] || 0) + 1;

        const sl = String(subjectCounters[subject]).padStart(SL_PADDING, '0');
        const subjectCode = SUBJECT_CODE_MAP[subject] || SUBJECT_CODE_MAP['Unknown'];
        const { tierCode, shiftValue } = extractExamDetails(note.tags);

        const tokenNo = `${tierCode}-${shiftValue}-${subjectCode}-${sl}`;
        mapping.push({ noteId: note.noteId, tokenNo });
    }
    return mapping;
}

async function updateNotesWithTokenNo(mapping: TokenMapping[]): Promise<void> {
    if (mapping.length === 0) {
        // This case is handled by buildTokenNoMapping, but good to keep as a safeguard
        // console.log("No notes to update.");
        return;
    }
    console.log(`\n--- Starting Updates in 3 seconds ---`);
    await delay(3000);

    const total = mapping.length;
    for (let i = 0; i < total; i++) {
        const { noteId, tokenNo } = mapping[i];
        const countStr = `[${i + 1}/${total}]`;
        try {
            // Ensure the field "TokenNo" exists on your note types in Anki
            await invokeAnkiConnect('updateNoteFields', {
                note: {
                    id: noteId,
                    fields: { TokenNo: tokenNo } // Make sure 'TokenNo' is an existing field name in your Anki notes
                }
            });
            console.log(`${countStr} ✅ Updated note ${noteId} with TokenNo: ${tokenNo}`);
        } catch (err: any) { // Catch specific error type if known
            console.error(`${countStr} ❌ Failed to update note ${noteId}: ${err.message}`);
        }
        if (i < total - 1) { // Don't delay after the last note
            await delay(1000); // 1 second delay between updates
        }
    }
    console.log('\n--- All updates completed ---');
}

// --- CLI Command Action ---
// This is the function that commander.js will call
export async function tokengenAction(options: TokengenCommandOptions): Promise<void> {
    const targetDeck = options.deck || DEFAULT_TARGET_DECK_NAME;
    console.log(`Starting TokenNo generation process for deck: "${targetDeck}"...`);

    // Errors will propagate to the main index.ts catch block
    const mapping = await buildTokenNoMapping(targetDeck);
    if (mapping.length > 0) {
        await updateNotesWithTokenNo(mapping);
    }
    // Message for no notes or no mapping is handled within buildTokenNoMapping or by mapping.length check.
    console.log("TokenNo generation process finished.");
}

// Function to register the command with Commander
export function registerTokengenCommand(program: Command) {
  program
    .command('token_gen')
    .description('Generates and updates TokenNo for notes in a specified Anki deck.')
    .option('-d, --deck <name>', 'Specify the target Anki deck name', DEFAULT_TARGET_DECK_NAME)
    .action(async (options: TokengenCommandOptions) => {
        // The `options` object will contain `deck` if provided by the user,
        // or the default value if not.
        await tokengenAction(options);
    });
}