// src/lib/anki.ts
import { logger } from './logger.js';
import { AnkiNoteDetails } from './types.js';

// Define a type for the AnkiConnect response. We use 'unknown' because the
// structure of the 'result' field can vary significantly depending on the
// action.
interface AnkiConnectResponse {
  result: unknown;
  error: string | null;
}

async function makeAnkiConnectRequest<T = unknown>( // Use generics
  action: string,
  params: Record<string, unknown> = {} // More precise type than 'any'
): Promise<T> {
  // Return a generic type
  const url = 'http://localhost:8765';
  const body = JSON.stringify({ action, version: 6, params });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      throw new Error(
        `AnkiConnect HTTP error: ${response.status} ${response.statusText}`
      );
    }

    // Use the AnkiConnectResponse type here.
    const result: AnkiConnectResponse = await response.json();
    if (result.error) {
      throw new Error(`AnkiConnect API error: ${result.error}`);
    }

    // We cast the result to the generic type T.
    return result.result as T;
  } catch (error) {
    logger.error({
      message: `Error in makeAnkiConnectRequest for action ${action}`,
      error,
    });
    throw error; // Re-throw for upstream handling
  }
}

export async function getNoteIdsFromDeck(deckName: string): Promise<number[]> {
  const query = `"deck:${deckName}"`;
  // We know findNotes returns an array of numbers.
  return makeAnkiConnectRequest<number[]>('findNotes', { query });
}

export async function getNotesDetails(
  noteIds: number[]
): Promise<AnkiNoteDetails[]> {
  // Corrected type
  return makeAnkiConnectRequest<AnkiNoteDetails[]>('notesInfo', {
    notes: noteIds,
  }); // Corrected type
}

export async function updateNoteFields(
  noteId: number,
  fields: { [key: string]: string }
): Promise<void> {
  // updateNoteFields doesn't return anything.
  await makeAnkiConnectRequest<void>('updateNoteFields', {
    note: { id: noteId, fields: fields },
  });
}

export async function addTagToNotes(
  noteIds: number[],
  tag: string
): Promise<void> {
  // addTags also doesn't return anything.
  await makeAnkiConnectRequest<void>('addTags', {
    notes: noteIds,
    tags: tag,
  });
}
