// src/commands/explain.ts
import { logger } from '../lib/logger.js';
import {
  getNoteIdsFromDeck,
  getNotesDetails,
  updateNoteFields,
} from '../lib/anki.js';
import {
  createExplanationPrompt,
  fetchOpenAICompletion,
} from '../lib/openai.js';
import { formatAnkiNotesForProcessing } from '../lib/formatters.js';
import { CUSTOM_STUDY_DECK } from '../lib/constants.js';
import { minify } from 'html-minifier-terser';

export async function explainAction() {
  try {
    console.log(
      `Fetching and explaining notes from '${CUSTOM_STUDY_DECK}' deck...`
    );

    const noteIds = await getNoteIdsFromDeck(CUSTOM_STUDY_DECK);
    logger.info({
      message: `Fetched ${noteIds.length} note IDs from '${CUSTOM_STUDY_DECK}'`,
    });

    const notesInfo = await getNotesDetails(noteIds);
    const formattedNotes = formatAnkiNotesForProcessing(notesInfo);

    for (const note of formattedNotes) {
      if (note.Extra && note.Extra.trim() !== '') {
        logger.info({
          message: `Skipping note ${note.noteId} - Extra field is not empty.`,
        });
        continue;
      }

      const prompt = createExplanationPrompt(note);
      const rawResponse = await fetchOpenAICompletion(prompt);

      // Process the raw response
      let explanation = rawResponse;
      if (explanation.startsWith('```html') && explanation.endsWith('```')) {
        explanation = explanation.slice(7, -3).trim();
      }

      if (
        explanation.startsWith('<explanation>') &&
        explanation.endsWith('</explanation>')
      ) {
        explanation = explanation.slice(13, -14).trim();
      }

      const minifiedExplanation = await minify(explanation, {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
      });

      try {
        await updateNoteFields(note.noteId, { Extra: minifiedExplanation });
        logger.info({ message: `Updated note ${note.noteId} in Anki.` });
      } catch (error) {
        logger.error({
          message: `Failed to update anki note id: ${note.noteId}`,
          error,
        });
      }
    }

    console.log('Finished updating notes in Anki.');
  } catch (error) {
    logger.error({ message: 'Error explaining notes', error });
    console.error(
      'Failed to explain notes:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    process.exit(1);
  }
}
