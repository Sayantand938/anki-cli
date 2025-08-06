// src/anki/types.ts

// Raw note structure from AnkiConnect
export interface AnkiNote {
  noteId: number;
  tags: string[];
  fields: {
    [key: string]: {
      value: string;
      order: number;
    };
  };
}

// Transformed note structure used in fetch-notes and for AI processing
export interface ProcessedNote {
  noteId: number;
  SL: string;
  Question: string;
  OP1: string;
  OP2: string;
  OP3: string;
  OP4: string;
  Answer: string;
  Extra: string;
  Tags: string[];
}

// Minimal structure used for updating the Extra field
export interface NoteUpdate {
  noteId: number;
  Extra: string;
}

// Structure for tag update operations from tags.json
export interface TagUpdate {
  noteId: number;
  newTag: string;
}

// Structure for SL field update operations
export interface SlUpdate {
  noteId: number;
  newSl: string;
}

// --- THIS IS THE FIX ---
// Structure for video field update operations
export interface VideoUpdate {
  noteId: number;
  videoFile: string;
}