// src/lib/types.ts
export interface AnkiNote {
  noteId: number;
  Question: string;
  OP1: string;
  OP2: string;
  OP3: string;
  OP4: string;
  Answer: string;
  Extra: string;
  tags: string[];
}

export interface AnkiNoteDetails {
  noteId: number;
  fields: {
    Question: { value: string };
    OP1: { value: string };
    OP2: { value: string };
    OP3: { value: string };
    OP4: { value: string };
    Answer: { value: string };
    Extra: { value: string };
  };
  tags: string[];
}
