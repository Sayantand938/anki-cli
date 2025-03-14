// src/commands/tag.ts
import { logger } from '../lib/logger.js';
import {
  getNoteIdsFromDeck,
  getNotesDetails,
  addTagToNotes,
} from '../lib/anki.js';
import { createTaggingPrompt, fetchOpenAICompletion } from '../lib/openai.js';
import {
  formatAnkiNotesForProcessing,
  extractTagFromOpenAIResponse,
} from '../lib/formatters.js';
import { CUSTOM_STUDY_DECK, VALID_TAGS } from '../lib/constants.js';

function getValidTagList(noteTags: string[]): {
  list: string[] | null;
  category: string | null;
} {
  for (const category of Object.keys(VALID_TAGS)) {
    if (noteTags.includes(category)) {
      return { list: VALID_TAGS[category], category };
    }
  }
  return { list: null, category: null };
}

export async function tagAction() {
  try {
    console.log(
      `Fetching and tagging notes from '${CUSTOM_STUDY_DECK}' deck...`
    );

    const noteIds = await getNoteIdsFromDeck(CUSTOM_STUDY_DECK);
    logger.info({
      message: `Fetched ${noteIds.length} note IDs from '${CUSTOM_STUDY_DECK}'`,
    });

    const notesInfo = await getNotesDetails(noteIds);
    const formattedNotes = formatAnkiNotesForProcessing(notesInfo);

    for (const note of formattedNotes) {
      const { list: validTagList, category } = getValidTagList(note.tags);

      if (!validTagList || !category) {
        logger.info({
          message: `Skipping note ${note.noteId} - No valid tag list found.`,
        });
        continue;
      }

      const prompt = createTaggingPrompt(note, validTagList, category);
      const openaiResponse = await fetchOpenAICompletion(prompt);
      const extractedTag = extractTagFromOpenAIResponse(openaiResponse);

      if (!extractedTag) {
        logger.warn({
          message: `Skipping note ${note.noteId} - Could not extract tag.`,
          response: openaiResponse,
        });
        continue;
      }

      if (!validTagList.includes(extractedTag)) {
        logger.warn({
          message: `Skipping note ${note.noteId} - Invalid tag "${extractedTag}".`,
          validTags: validTagList,
        });
        continue;
      }

      try {
        // Get an array containing only the current note ID.
        const noteIdArray = [note.noteId];
        await addTagToNotes(noteIdArray, extractedTag); // Pass the array and tag
        logger.info({
          message: `Added tag "${extractedTag}" to note ${note.noteId}.`,
        });
      } catch (error) {
        logger.error({
          message: `Failed to add tag to note ${note.noteId}`,
          error,
        });
      }
    }

    console.log('Finished tagging notes in Anki.');
  } catch (error) {
    logger.error({ message: 'Error tagging notes', error });
    console.error(
      'Failed to tag notes:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    process.exit(1);
  }
}
