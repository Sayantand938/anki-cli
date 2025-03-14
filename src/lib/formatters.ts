// src/lib/formatters.ts
import { AnkiNote, AnkiNoteDetails } from './types.js';

export function formatAnkiNotesForProcessing(
  notesInfo: AnkiNoteDetails[]
): AnkiNote[] {
  return notesInfo.map((note) => ({
    noteId: note.noteId,
    Question: note.fields.Question.value,
    OP1: note.fields.OP1.value,
    OP2: note.fields.OP2.value,
    OP3: note.fields.OP3.value,
    OP4: note.fields.OP4.value,
    Answer: note.fields.Answer.value,
    Extra: note.fields.Extra.value,
    tags: note.tags,
  }));
}

export function extractTagFromOpenAIResponse(
  openaiResponse: string
): string | null {
  const match = openaiResponse.match(/<tag>(.*?)<\/tag>/);
  return match ? match[1].trim() : null;
}
