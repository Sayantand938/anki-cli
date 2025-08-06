// src/commands/add.ts
import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

import { logger } from '../utils/logger.js';
import { handleError } from '../utils/errorHandler.js';
import { ankiConnectRequest } from '../anki/connector.js';
import { DATA_DIR } from '../config/paths.js';
import {
  QUESTION_BLOCK_EXTRA_MARKER,
  QUESTION_BLOCK_QUESTION_MARKER,
} from '../config/anki.js';

interface ParsedNote {
  Question: string;
  OP1: string;
  OP2: string;
  OP3: string;
  OP4: string;
  Answer: string;
  Extra: string;
}

// --- File and Path Handling ---
function getNoteFilePath(fileName?: string): string {
  if (fileName) {
    // If a filename is provided, resolve it relative to the current working directory.
    return path.resolve(fileName);
  }

  // If no filename is provided, fall back to the environment variable.
  const obsidianDir = process.env.OBSIDIAN;
  if (!obsidianDir) {
    throw new Error(
      `No file specified and 'OBSIDIAN' environment variable is not set. Please provide a file path or set the variable.`,
    );
  }
  return path.join(obsidianDir, 'Untitled.md');
}

// --- Text Processing Helpers ---

function convertLatexDelimiters(text: string): string {
  return text.replace(/\$(.*?)\$/g, '\\($1\\)');
}

function convertMarkdownImagesToHtml(text: string): string {
  return text.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="">');
}

function removeBoldFormatting(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '$1');
}

function processText(text: string): string {
  let processedText = text;
  processedText = removeBoldFormatting(processedText);
  processedText = convertLatexDelimiters(processedText);
  processedText = convertMarkdownImagesToHtml(processedText);
  return processedText;
}


// --- Core Parsing Logic ---
function parseQuestionBlock(blockContent: string): ParsedNote | null {
  const [questionSection, extraSection = ''] = blockContent.split(
    QUESTION_BLOCK_EXTRA_MARKER,
  );
  const questionContent = questionSection
    .split(QUESTION_BLOCK_QUESTION_MARKER)[1]
    ?.trim();

  if (!questionContent) return null;

  const lines = questionContent.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 5) {
    logger.warn('Skipping block with insufficient lines (question + 4 options).');
    return null;
  }

  const optionLines = lines.slice(-4);
  const questionLines = lines.slice(0, -4);
  
  const question = processText(questionLines.join('<br>').trim());
  const options: string[] = [];
  let answer = '';

  optionLines.forEach((line, index) => {
    let cleanLine = line.trim();
    if (cleanLine.includes('✅')) {
      answer = (index + 1).toString();
      cleanLine = cleanLine.replace('✅', '').trim();
    }
    if (cleanLine.startsWith('- ')) {
      cleanLine = cleanLine.substring(2);
    }
    options.push(processText(cleanLine));
  });

  if (!answer) {
    logger.warn(`Skipping block because no correct answer (✅) was found.`);
    return null;
  }
  
  const extra = processText(extraSection.trim().split('\n').join('<br>').trim());

  return {
    Question: question,
    OP1: options[0] ?? '',
    OP2: options[1] ?? '',
    OP3: options[2] ?? '',
    OP4: options[3] ?? '',
    Answer: answer,
    Extra: extra,
  };
}

function parseMarkdown(content: string): { notes: ParsedNote[]; tags: string } {
  const codeBlockRegex = /```(.*)\n([\s\S]*?)```/g;
  let match;
  const notes: ParsedNote[] = [];
  let tags = '';

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const header = match[1].trim();
    const blockContent = match[2];
    if (header === 'tags') {
      tags = blockContent.trim();
    } else if (header.toLowerCase().startsWith('q-')) {
      const note = parseQuestionBlock(blockContent);
      if (note) notes.push(note);
    }
  }
  return { notes, tags };
}

// --- TSV Generation ---
function generateTsv(notes: ParsedNote[], tags: string): string {
  if (notes.length === 0) return '';
  
  const metadata = [
    '#separator:tab',
    '#html:true',
    '#tags column:10',
  ].join('\n');

  const dataRows = notes.map(note =>
    [
      '-',           // Column 1: SL
      note.Question, // Column 2: Question
      note.OP1,      // Column 3: OP1
      note.OP2,      // Column 4: OP2
      note.OP3,      // Column 5: OP3
      note.OP4,      // Column 6: OP4
      note.Answer,   // Column 7: Answer
      note.Extra,    // Column 8: Extra
      '',            // Column 9: Empty
      tags,          // Column 10: Tags
    ].join('\t')
  ).join('\n');

  return `${metadata}\n${dataRows}`;
}

// --- Commander Command Definition ---
const addCmd = new Command('add')
  .description('Parse an Obsidian note, save it as input.tsv, and trigger Anki import.')
  .argument('[file]', "Path to the markdown file (defaults to 'Untitled.md' in OBSIDIAN dir)")
  .option('--no-import', 'Only generate the tsv file, do not open Anki')
  .action(async (file: string | undefined, options: { import: boolean }) => {
    try {
      const filePath = getNoteFilePath(file);
      logger.info(`Reading note from: ${chalk.dim(filePath)}`);

      const content = await fs.readFile(filePath, 'utf-8');
      const { notes, tags } = parseMarkdown(content);

      if (notes.length === 0) {
        logger.warn('No valid question blocks were found in the file.');
        return;
      }
      
      logger.success(`Found ${chalk.green(notes.length)} question(s) and the tag "${chalk.yellow(tags)}".`);
      
      const tsvOutput = generateTsv(notes, tags);
      const outputTsvPath = path.join(DATA_DIR, 'input.tsv');

      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(outputTsvPath, tsvOutput, 'utf-8');
      
      logger.log('----');
      logger.success(`Successfully saved ${chalk.green(notes.length)} notes to ${chalk.cyan(outputTsvPath)}`);

      if (options.import) {
        try {
          logger.info('Attempting to open Anki import dialog...');
          const ankiConnectPath = outputTsvPath.replace(/\\/g, '/');
          
          await ankiConnectRequest('guiImportFile', { path: ankiConnectPath });
          
          logger.success('Anki import dialog opened. Please review and confirm in Anki.');
          logger.warn('This feature requires Anki v2.1.52+');
        } catch (error: any) {
          logger.error(`Could not trigger Anki import: ${error.message}`);
        }
      }

    } catch (error) {
      handleError(error);
    }
  });

export default addCmd;