// src/commands/export.ts
import { logger } from '../lib/logger.js';
import path from 'path';
import fs from 'fs';
import envPaths from 'env-paths';
import { getNoteIdsFromDeck, getNotesDetails } from '../lib/anki.js';
import { formatAnkiNotesForProcessing } from '../lib/formatters.js';
import { CUSTOM_STUDY_DECK } from '../lib/constants.js';

export async function exportAction() {
  try {
    console.log(`Exporting notes from '${CUSTOM_STUDY_DECK}' deck...`);

    const noteIds = await getNoteIdsFromDeck(CUSTOM_STUDY_DECK);
    logger.info({
      message: `Fetched ${noteIds.length} note IDs from '${CUSTOM_STUDY_DECK}'`,
    });

    const notesInfo = await getNotesDetails(noteIds);
    const transformedNotes = formatAnkiNotesForProcessing(notesInfo);

    const paths = envPaths('anki-cli');
    const outputDir = paths.data;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, 'custom_study_session.json');
    fs.writeFileSync(
      outputFile,
      JSON.stringify(transformedNotes, null, 2),
      'utf-8'
    );

    logger.info({ message: 'Saved note details to file', file: outputFile });
    console.log(`Note details saved to: ${outputFile}`);
  } catch (error) {
    logger.error({ message: 'Error exporting notes', error });
    console.error(
      'Failed to export notes:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    process.exit(1);
  }
}
