// src/lib/openai.ts
import OpenAI from 'openai';
import { AnkiNote } from './types.js';
import {
  EXPLANATION_PROMPT_TEMPLATE,
  TAGGING_PROMPT_TEMPLATE,
  TAGGING_INSTRUCTIONS,
  OPENAI_MODEL,
} from './constants.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function fetchOpenAICompletion(prompt: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL, // Use the constant here
      messages: [{ role: 'user', content: prompt }],
    });

    // Return the raw response content
    return completion.choices[0].message.content || 'No response available.';
  } catch (error) {
    console.error('Error generating response with OpenAI:', error);
    return 'Error generating response.'; // Consistent error message
  }
}

export function createExplanationPrompt(note: AnkiNote): string {
  const options = ['OP1', 'OP2', 'OP3', 'OP4'];
  const answerIndex = parseInt(note.Answer, 10) - 1;
  const correctOptionText = note[
    options[answerIndex] as keyof AnkiNote
  ] as string;

  return EXPLANATION_PROMPT_TEMPLATE.replace('{question}', note.Question)
    .replace('{op1}', note.OP1)
    .replace('{op2}', note.OP2)
    .replace('{op3}', note.OP3)
    .replace('{op4}', note.OP4)
    .replace('{correctAnswer}', correctOptionText);
}

export function createTaggingPrompt(
  note: AnkiNote,
  validTagList: string[],
  category: string
): string {
  const options = ['OP1', 'OP2', 'OP3', 'OP4'];
  const answerIndex = parseInt(note.Answer, 10) - 1;
  const correctOptionText = note[
    options[answerIndex] as keyof AnkiNote
  ] as string;

  const validTagsString = validTagList.map((tag) => `  - ${tag}`).join('\n');
  const instructions = TAGGING_INSTRUCTIONS[category] || '';

  return TAGGING_PROMPT_TEMPLATE.replace('{validTags}', validTagsString)
    .replace('{instructions}', instructions)
    .replace('{question}', note.Question)
    .replace('{op1}', note.OP1)
    .replace('{op2}', note.OP2)
    .replace('{op3}', note.OP3)
    .replace('{op4}', note.OP4)
    .replace('{correctAnswer}', correctOptionText);
}
