// src/commands/noteidselector.ts
import { Command } from 'commander';
import axios, { AxiosError } from 'axios';
// import clipboardy from 'clipboardy'; // Using dynamic import

// --- Configuration ---
const ANKI_CONNECT_URL = 'http://localhost:8765';
const ANKI_API_VERSION = 6;
const ANKI_REQUEST_TIMEOUT = 15000;
const DEFAULT_DECK_NAME = 'Custom Study Session';
const TOKEN_FIELD_NAME = 'TokenNo';

// --- Type Definitions ---
interface AnkiNoteRaw {
    noteId: number;
    tags: string[];
    fields: Record<string, { value: string, order: number }>;
}

interface ProcessedNote {
    noteId: number;
    tokenNo: string;
}

export interface NoteIdSelectorOptions {
    start: string;
    end?: string;     // Now optional
    count?: number;   // New optional number, will be parsed by commander
    deck?: string;
}

// --- Helper: AnkiConnect Request (using axios) ---
async function ankiConnectRequest(action: string, params: Record<string, any> = {}): Promise<any> {
    try {
        const response = await axios.post(ANKI_CONNECT_URL, {
            action: action,
            version: ANKI_API_VERSION,
            params: params
        }, { timeout: ANKI_REQUEST_TIMEOUT });

        if (response.data.error) {
            if (response.data.error.includes("deck not found") || response.data.error.includes("deck was not found")) {
                const deckName = params?.query?.match(/deck:"([^"]+)"/)?.[1] || params?.deckName || 'provided name';
                throw new Error(`AnkiConnect Error: Deck "${deckName}" not found.`);
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
        throw error;
    }
}

// --- Core Logic ---

async function fetchNotesFromDeck(deckName: string): Promise<ProcessedNote[]> {
    console.log(`Fetching notes from deck: "${deckName}"...`);
    const notesRaw: AnkiNoteRaw[] = await ankiConnectRequest("notesInfo", {
        query: `deck:"${deckName}"`,
    });

    if (!notesRaw || notesRaw.length === 0) {
        console.log(`No notes found in the "${deckName}" deck.`);
        return [];
    }
    console.log(`Found ${notesRaw.length} raw notes. Processing...`);

    const processedNotes: ProcessedNote[] = [];
    let skippedCount = 0;
    for (const note of notesRaw) {
        const tokenValue = note.fields[TOKEN_FIELD_NAME]?.value;
        if (note.noteId && tokenValue && tokenValue.trim() !== "") {
            processedNotes.push({
                noteId: note.noteId,
                tokenNo: tokenValue.trim(),
            });
        } else {
            skippedCount++;
        }
    }
    if (skippedCount > 0) {
        console.warn(`[INFO] Skipped ${skippedCount} notes due to missing Note ID or empty '${TOKEN_FIELD_NAME}' field.`);
    }
    // **Sort all processed notes by tokenNo here**
    processedNotes.sort((a, b) => a.tokenNo.localeCompare(b.tokenNo));
    console.log(`Processed and sorted ${processedNotes.length} notes with valid TokenNo.`);
    return processedNotes;
}

function formatNoteIdsForClipboard(notes: ProcessedNote[]): string {
    if (!notes || notes.length === 0) {
        return "";
    }
    return notes.map(note => `nid:${note.noteId}`).join(" OR ");
}

async function copyToClipboard(
    text: string,
    displayStartToken: string,
    displayEndToken: string,
    selectedCount: number,
    isCountMode: boolean,
    userRequestedStartToken?: string // For count mode message enhancement
): Promise<void> {
    if (!text) {
        console.log("Nothing to copy to clipboard.");
        return;
    }
    try {
        const {default: clipboardy} = await import('clipboardy');
        await clipboardy.write(text);
        let message: string;
        if (isCountMode) {
            message = `Note IDs for ${selectedCount} notes (tokens ${displayStartToken} to ${displayEndToken}) copied to clipboard ✅`;
            if (userRequestedStartToken && userRequestedStartToken !== displayStartToken) {
                message += ` (requested from ${userRequestedStartToken})`;
            }
        } else {
            message = `Note IDs for tokens from ${displayStartToken} to ${displayEndToken} (${selectedCount} notes) copied to clipboard ✅`;
        }
        console.log(message);
    } catch (error: any) {
        console.error("Failed to copy to clipboard. Please copy the following manually:");
        console.log("------------------------------------------");
        console.log(text);
        console.log("------------------------------------------");
        throw new Error(`Clipboard error: ${error.message}`);
    }
}

// --- CLI Command Action ---
export async function noteidselectorAction(options: NoteIdSelectorOptions): Promise<void> {
    const { start: startTokenInput, end: endTokenInput, count: countInput, deck } = options;
    const deckNameToUse = deck || DEFAULT_DECK_NAME;

    // Validation for options
    if (endTokenInput && typeof countInput !== 'undefined') {
        throw new Error("Cannot use both --end and --count. Please specify one or the other.");
    }
    if (!endTokenInput && typeof countInput === 'undefined') {
        throw new Error("Either --end or --count must be provided along with --start.");
    }
    if (typeof countInput !== 'undefined' && (isNaN(countInput) || countInput <= 0)) {
        throw new Error("--count must be a positive number.");
    }

    let mode: 'range' | 'count';
    let logMessage: string;

    if (typeof countInput === 'number') {
        mode = 'count';
        logMessage = `Fetching notes starting from TokenNo ${startTokenInput} for a count of ${countInput}.`;
    } else { // endTokenInput must be present due to validation above
        mode = 'range';
        logMessage = `Fetching notes by TokenNo range: ${startTokenInput} to ${endTokenInput}.`;
        if (startTokenInput > endTokenInput!) {
             console.warn(`Warning: Start token "${startTokenInput}" is greater than end token "${endTokenInput}". No notes will be selected if this is a strict range.`);
            // Depending on desired behavior, you might throw an error or let it proceed to find 0 notes.
            // The current filter logic (>= start && <= end) will correctly yield 0 notes.
        }
    }

    console.log(logMessage);
    console.log(`Target Deck: "${deckNameToUse}"`);

    const allSortedNotes = await fetchNotesFromDeck(deckNameToUse);
    if (allSortedNotes.length === 0) {
        return; // Message already logged by fetchNotesFromDeck
    }

    let filteredNotes: ProcessedNote[] = [];
    
    if (mode === 'count') {
        const startIndex = allSortedNotes.findIndex(note => note.tokenNo >= startTokenInput);
        if (startIndex !== -1) {
            filteredNotes = allSortedNotes.slice(startIndex, startIndex + countInput!);
        }
    } else { // mode === 'range'
        filteredNotes = allSortedNotes.filter(note => note.tokenNo >= startTokenInput && note.tokenNo <= endTokenInput!);
    }

    if (filteredNotes.length === 0) {
        let reason = "";
        if (mode === 'count') {
            reason = ` (requested start "${startTokenInput}", count ${countInput})`;
        } else {
            reason = ` (requested range "${startTokenInput}" to "${endTokenInput}")`;
        }
        console.log(`No notes found matching the criteria${reason} in deck "${deckNameToUse}".`);
        return;
    }

    console.log(`Found ${filteredNotes.length} notes matching criteria.`);

    const displayStartToken = filteredNotes[0].tokenNo;
    const displayEndToken = filteredNotes[filteredNotes.length - 1].tokenNo;

    const formattedNoteIds = formatNoteIdsForClipboard(filteredNotes);
    await copyToClipboard(
        formattedNoteIds,
        displayStartToken,
        displayEndToken,
        filteredNotes.length,
        mode === 'count',
        mode === 'count' ? startTokenInput : undefined
    );

    console.log("Note ID selection process finished.");
}

// --- Function to register the command with Commander ---
export function registerNoteIdSelectorCommand(program: Command) {
  program
    .command('noteidselector')
    .description('Fetches notes by TokenNo (range or start+count) and copies their Note IDs to clipboard.')
    .requiredOption('-s, --start <tokenNo>', 'Starting TokenNo for the range/selection')
    .option('-e, --end <tokenNo>', 'Ending TokenNo for the range (cannot be used with --count)')
    .option('-c, --count <number>', 'Number of notes to select starting from/after --start (cannot be used with --end)', s => parseInt(s, 10))
    .option('-d, --deck <name>', `Target Anki deck name (default: "${DEFAULT_DECK_NAME}")`)
    .action(async (options: NoteIdSelectorOptions) => {
        await noteidselectorAction(options);
    });
}