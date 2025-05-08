import { Command } from "commander";
import axios from "axios";
import Table from "cli-table3";
import chalk from "chalk";

interface AnkiConnectDeckStats {
  [deckId: string]: {
    name: string;
    new_count: number;
    learn_count: number;
    review_count: number;
    // Add other potential properties if needed, though the script only uses these
  };
}

interface AnkiConnectResponse<T> {
  result?: T;
  error?: string;
}

async function getDeckStats(decks: string[]): Promise<void> {
  try {
    const table = new Table({
      head: [
        chalk.blue.bold("Deck"),
        chalk.blue.bold("New"),
        chalk.blue.bold("Learn"),
        chalk.blue.bold("Due"),
        chalk.blue.bold("Total"),
      ],
      style: {
        border: ["white"],
        head: ["center"],
      },
      colAligns: ["center", "center", "center", "center", "center"],
      chars: {
        top: "═",
        "top-mid": "╤",
        "top-left": "╔",
        "top-right": "╗",
        bottom: "═",
        "bottom-mid": "╧",
        "bottom-left": "╚",
        "bottom-right": "╝",
        left: "║",
        "left-mid": "╟",
        mid: "─",
        "mid-mid": "┼",
        right: "║",
        "right-mid": "╢",
        middle: "│",
      },
    });

    const response = await axios.post<AnkiConnectResponse<AnkiConnectDeckStats>>(
      "http://localhost:8765",
      {
        action: "getDeckStats",
        version: 6,
        params: {
          decks: decks,
        },
      }
    );

    if (response.data.error) {
      console.error(
        chalk.red("Error from AnkiConnect:"),
        response.data.error
      );
      return;
    }

    const stats = response.data.result;

    if (!stats) {
        console.log(chalk.yellow("No deck stats received from AnkiConnect."));
        return;
    }

    let totalSum = 0;

    for (const deckId in stats) {
      const deck = stats[deckId];
      const total = deck.new_count + deck.learn_count + deck.review_count;
      totalSum += total;
      table.push([
        deck.name,
        deck.new_count,
        deck.learn_count,
        deck.review_count,
        total,
      ]);
    }

    // Add the final row for the total sum, spanning all columns
    table.push([
      {
        colSpan: 5,
        content: chalk.bold(`Total Cards Across All Decks: ${totalSum}`),
        hAlign: "center",
      },
    ]);

    console.log(table.toString());
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error(
          chalk.red(
            `AnkiConnect request failed with status ${error.response.status}: ${error.response.statusText}`
          )
        );
        if (error.response.data && typeof error.response.data === 'object' && 'error' in error.response.data) {
          console.error(
            chalk.red("AnkiConnect error details:"),
            (error.response.data as any).error
          );
        } else if (error.response.data) {
          console.error(
            chalk.red("AnkiConnect response data:"),
            JSON.stringify(error.response.data, null, 2)
          );
        }
      } else if (error.request) {
        console.error(
          chalk.red(
            "Failed to connect to AnkiConnect. Is Anki running with AnkiConnect add-on installed and enabled? No response received."
          )
        );
      } else {
        console.error(
          chalk.red("Error setting up AnkiConnect request:"),
          error.message
        );
      }
    } else {
      console.error(
        chalk.red("An unexpected script error occurred:"),
        (error as Error).message
      );
    }
  }
}

export function registerDeckstatsCommand(program: Command) {
  program
    .command("deckstats")
    .description("Fetch Due, Learn, and New card counts for specified Anki decks")
    .option("-d, --decks <names...>", "List of deck names", [
      "MATH",
      "GK",
      "GI",
      "ENG",
    ])
    .action(async (options: { decks: string[] }) => {
      await getDeckStats(options.decks);
    });
}