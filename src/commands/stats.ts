// src\commands\stats.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { handleError } from '../utils/errorHandler.js';
import { ankiConnectRequest } from '../anki/connector.js';
import { delay } from '../utils/timers.js';
import { ANKI_CONNECT_DELAY_MS } from '../config/app.js';
import Table from 'cli-table3';

const TARGET_DECKS = ['CGL', 'WBCS'];

interface StudiedStats {
  deck: string;
  newStudied: number;
  reviewStudied: number;
}

/**
 * Fetches stats on cards studied today using Anki search queries.
 * @returns A promise resolving to stats for each target deck.
 */
async function getTodayStudyStats(): Promise<StudiedStats[]> {
  const results: StudiedStats[] = [];

  for (const deck of TARGET_DECKS) {
    logger.info(`Fetching stats for deck: ${deck}`);

    await delay(ANKI_CONNECT_DELAY_MS);

    const newCardsQuery = `deck:${deck} rated:1 introduced:1`;
    const reviewedCardsQuery = `deck:${deck} rated:1 -introduced:1`;

    const [newCardIds, reviewedCardIds] = await Promise.all([
      ankiConnectRequest('findCards', { query: newCardsQuery }),
      ankiConnectRequest('findCards', { query: reviewedCardsQuery }),
    ]);

    results.push({
      deck,
      newStudied: newCardIds.length,
      reviewStudied: reviewedCardIds.length,
    });
  }

  return results;
}

/**
 * Displays today's study stats using cli-table3.
 * @param stats Array of stats per deck.
 */
function displayTodayStatsTable(stats: StudiedStats[]): void {
  if (stats.length > 0) {
    logger.log('---');
    logger.info(chalk.bold("Today's Studied Card Stats"));

    const table = new Table({
      head: [chalk.cyan.bold('Deck'), chalk.cyan.bold('New Studied'), chalk.cyan.bold('Reviewed')],
      colAligns: ['center', 'center', 'center'],
      rowAligns: ['center', 'center', 'center'],
      style: {
        head: [],
        border: [],
      },
      chars: {
        'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
        'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
        'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼',
        'right': '║', 'right-mid': '╢', 'middle': '│'
      }
    });

    // --- MODIFICATION START ---
    stats.forEach(item => {
      let newStudiedDisplay: string;
      let reviewStudiedDisplay: string;

      // Conditional coloring for New Studied
      if (item.deck === 'CGL') {
        newStudiedDisplay = item.newStudied <= 100
          ? chalk.red(item.newStudied)
          : chalk.green(item.newStudied);
      } else if (item.deck === 'WBCS') {
        newStudiedDisplay = item.newStudied <= 200
          ? chalk.red(item.newStudied)
          : chalk.green(item.newStudied);
      } else {
        newStudiedDisplay = String(item.newStudied); // Default, no color
      }

      // Conditional coloring for Reviewed
      if (item.deck === 'CGL') {
        reviewStudiedDisplay = item.reviewStudied <= 200
          ? chalk.red(item.reviewStudied)
          : chalk.green(item.reviewStudied);
      } else if (item.deck === 'WBCS') {
        // Assuming your last rule was for 'Reviewed' cards
        reviewStudiedDisplay = item.reviewStudied <= 300
          ? chalk.red(item.reviewStudied)
          : chalk.green(item.reviewStudied);
      } else {
        reviewStudiedDisplay = String(item.reviewStudied); // Default, no color
      }

      table.push([item.deck, newStudiedDisplay, reviewStudiedDisplay]);
    });
    // --- MODIFICATION END ---

    console.log(table.toString());

    logger.log('---');

    const totalNew = stats.reduce((sum, s) => sum + s.newStudied, 0);
    const totalReview = stats.reduce((sum, s) => sum + s.reviewStudied, 0);

    logger.info(`Total new cards studied: ${chalk.blue(totalNew)}`);
    logger.info(`Total reviewed cards studied: ${chalk.green(totalReview)}`);
  } else {
    logger.info('No studied cards found for today.');
  }
}

// --- CLI Command Definition ---
const statsCmd = new Command('stats')
  .description("Show today's studied card stats (new and review) for CGL and WBCS decks.")
  .action(async () => {
    try {
      const stats = await getTodayStudyStats();

      logger.info('Displaying stats...');
      await delay(ANKI_CONNECT_DELAY_MS);

      displayTodayStatsTable(stats);
    } catch (error) {
      handleError(error);
    }
  });

export default statsCmd;