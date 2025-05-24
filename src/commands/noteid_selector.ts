// src/commands/noteidselector.ts
import { Command } from 'commander';
import axios, { AxiosError } from 'axios';
// import clipboardy from 'clipboardy'; // Using dynamic import

// --- Configuration ---
const ANKI_CONNECT_URL = 'http://localhost:8765';
const ANKI_API_VERSION = 6;
const ANKI_REQUEST_TIMEOUT = 15000;
const DEFAULT_DECK_NAME = 'Custom Study Session';
const SL_FIELD_NAME = 'SL'; 

// --- Type Definitions ---
interface AnkiNoteRaw {
    noteId: number;
    tags: string[];
    fields: Record<string, { value: string, order: number }>;
}

interface ProcessedNote {
    noteId: number;
    sl: string; 
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
        const slValue = note.fields[SL_FIELD_NAME]?.value;
        if (note.noteId && slValue && slValue.trim() !== "") {
            processedNotes.push({
                noteId: note.noteId,
                sl: slValue.trim(), 
            });
        } else {
            skippedCount++;
        }
    }
    if (skippedCount > 0) {
        console.warn(`[INFO] Skipped ${skippedCount} notes due to missing Note ID or empty '${SL_FIELD_NAME}' field.`);
    }

    // Sort all processed notes by sl
    processedNotes.sort((a, b) => a.sl.localeCompare(b.sl));
    console.log(`Processed and sorted ${processedNotes.length} notes with valid SL.`);
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
    displayStartSl: string,
    displayEndSl: string,
    selectedCount: number,
    isCountMode: boolean,
    userRequestedStartSl?: string // For count mode message enhancement
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
            message = `Note IDs for ${selectedCount} notes (SLs ${displayStartSl} to ${displayEndSl}) copied to clipboard ✅`;
            if (userRequestedStartSl && userRequestedStartSl !== displayStartSl) {
                message += ` (requested from ${userRequestedStartSl})`;
            }
        } else {
            message = `Note IDs for SLs from ${displayStartSl} to ${displayEndSl} (${selectedCount} notes) copied to clipboard ✅`;
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
    const { start: startSlInput, end: endSlInput, count: countInput, deck } = options;
    const deckNameToUse = deck || DEFAULT_DECK_NAME;

    // Validation for options
    if (endSlInput && typeof countInput !== 'undefined') {
        throw new Error("Cannot use both --end and --count. Please specify one or the other.");
    }
    if (!endSlInput && typeof countInput === 'undefined') {
        throw new Error("Either --end or --count must be provided along with --start.");
    }
    if (typeof countInput !== 'undefined' && (isNaN(countInput) || countInput <= 0)) {
        throw new Error("--count must be a positive number.");
    }

    let mode: 'range' | 'count';
    let logMessage: string;

    if (typeof countInput === 'number') {
        mode = 'count';
        logMessage = `Fetching notes starting from SL ${startSlInput} for a count of ${countInput}.`;
    } else { // endSlInput must be present due to validation above
        mode = 'range';
        logMessage = `Fetching notes by SL range: ${startSlInput} to ${endSlInput}.`;
        if (startSlInput > endSlInput!) {
            console.warn(`Warning: Start SL "${startSlInput}" is greater than end SL "${endSlInput}". No notes will be selected if this is a strict range.`);
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
        const startIndex = allSortedNotes.findIndex(note => note.sl >= startSlInput);
        if (startIndex !== -1) {
            filteredNotes = allSortedNotes.slice(startIndex, startIndex + countInput!);
        }
    } else { // mode === 'range'
        filteredNotes = allSortedNotes.filter(note => note.sl >= startSlInput && note.sl <= endSlInput!);
    }

    if (filteredNotes.length === 0) {
        let reason = "";
        if (mode === 'count') {
            reason = ` (requested start "${startSlInput}", count ${countInput})`;
        } else {
            reason = ` (requested range "${startSlInput}" to "${endSlInput}")`;
        }
        console.log(`No notes found matching the criteria${reason} in deck "${deckNameToUse}".`);
        return;
    }

    console.log(`Found ${filteredNotes.length} notes matching criteria.`);

    const displayStartSl = filteredNotes[0].sl;
    const displayEndSl = filteredNotes[filteredNotes.length - 1].sl;

    const formattedNoteIds = formatNoteIdsForClipboard(filteredNotes);
    await copyToClipboard(
        formattedNoteIds,
        displayStartSl,
        displayEndSl,
        filteredNotes.length,
        mode === 'count',
        mode === 'count' ? startSlInput : undefined
    );

    console.log("Note ID selection process finished.");
}

// --- Function to register the command with Commander ---
export function registerNoteIdSelectorCommand(program: Command) {
    program
        .command('noteid_selector')
        .description('Fetches notes by SL and copies their Note IDs to clipboard.')
        .requiredOption('-s, --start <sl>', 'Starting SL for the range/selection')
        .option('-e, --end <sl>', 'Ending SL for the range (cannot be used with --count)')
        .option('-c, --count <number>', 'Number of notes to select starting from/after --start (cannot be used with --end)', s => parseInt(s, 10))
        .option('-d, --deck <name>', `Target Anki deck name (default: "${DEFAULT_DECK_NAME}")`)
        .action(async (options: NoteIdSelectorOptions) => {
            await noteidselectorAction(options);
        });
}