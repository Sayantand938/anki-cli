// src/commands/add.ts
import type { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import envPaths from "env-paths";
import axios from "axios";

const ANKICONNECT_URL = "http://127.0.0.1:8765";
const APP_NAME = "anki-cli-import";
const DEFAULT_INPUT_PATH = "D:\\OBSIDIAN\\Untitled.md";

function removeMarkdownFormatting(text: string): string {
    if (typeof text !== 'string') return '';
    text = text.replace(/\*\*(.*?)\*\*/g, '$1');    
    return text;
}

function formatLaTeX(text: string): string {
    if (typeof text !== 'string') return '';
    text = text.replace(/(?<!\\)\$(.*?)(?<!\\)\$/g, '\\($1\\)');
    text = text.replace(/(?<!\\)\$\$(.*?)(?<!\\)\$\$/g, '\\[$1\\]');
    return text;
}

function extractTags(input: string): string {
    const tagsMatch = input.match(/```tags\s+([\s\S]*?)```/);
    return tagsMatch ? tagsMatch[1].trim().replace(/\n+/g, ' ') : 'untagged';
}

function convertMarkdownImagesToHtml(text: string): string {
    if (typeof text !== 'string') return '';
    return text.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">');
}

interface QuestionSections {
    questionText: string;
    extraText: string;
}
function extractQuestionSections(block: string): QuestionSections {
    const questionMatch = block.match(/<===================={QUESTION}====================>([\s\S]*?)<===================={EXTRA}====================>/);
    const extraMatch = block.match(/<===================={EXTRA}====================>([\s\S]*)/);

    let formattedExtraText = '';
    if (extraMatch && extraMatch[1]) {
        const rawExtraText = extraMatch[1];
        const lines = rawExtraText.split('\n');
        const processedLines = lines
            .map(line => line.replace(/```/g, '').trim())
            .map(line => removeMarkdownFormatting(line))
            .map(line => convertMarkdownImagesToHtml(line))
            .filter(line => line !== '');
        formattedExtraText = processedLines.join('<br>');
    }

    return { questionText: questionMatch ? questionMatch[1] : '', extraText: formattedExtraText };
}


function processQuestionBlock(block: string, tags: string): string {
    const { questionText: rawQuestionText, extraText } = extractQuestionSections(block);

    if (!rawQuestionText) return '';

    const allLines = rawQuestionText.split('\n').map(line => line.trim()).filter(line => line !== '');
    if (allLines.length < 5) return '';

    const numOptions = 4;
    const rawOptions = allLines.slice(-numOptions);
    const questionLines = allLines.slice(0, allLines.length - numOptions);

    let processedQuestion = questionLines.join('<br>');
    processedQuestion = removeMarkdownFormatting(processedQuestion);
    processedQuestion = convertMarkdownImagesToHtml(processedQuestion);
    processedQuestion = formatLaTeX(processedQuestion);

    const correctAnswerIndex = rawOptions.findIndex(option => option.includes('✅')) + 1;
    if (correctAnswerIndex === 0) return '';

    const finalOptions = rawOptions.map(option => {
        let processedOption = option.replace('✅', '').replace(/^-\s*/, '').trim();
        processedOption = removeMarkdownFormatting(processedOption);
        processedOption = convertMarkdownImagesToHtml(processedOption);
        processedOption = formatLaTeX(processedOption);
        return processedOption;
    });

    while (finalOptions.length < numOptions) finalOptions.push('');

    return [processedQuestion, ...finalOptions.slice(0, numOptions), correctAnswerIndex, extraText, tags].join('\t');
}


function processQuestions(input: string): string {
    const blocks = input.split(/```Q-\d+\s*/).filter(block => block.trim() !== "");
    const tags = extractTags(input);

    let validBlocks = blocks;
    if (blocks.length > 0 && !blocks[0].includes("<===================={QUESTION}====================>")) {
        validBlocks = blocks.slice(1);
    }

    return validBlocks
        .map(block => processQuestionBlock(block, tags))
        .filter(line => line !== "")
        .join("\n");
}

async function triggerAnkiImport(filePath: string): Promise<void> {
    const ankiPath = filePath.replace(/\\/g, '/');
    const payload = {
        action: "guiImportFile",
        version: 6,
        params: { path: ankiPath }
    };

    try {
        console.log(`Attempting to trigger Anki import for: ${ankiPath}`);
        const response = await axios.post(ANKICONNECT_URL, payload);

        if (response.data.error) {
            throw new Error(`AnkiConnect Error: ${response.data.error}`);
        }
        console.log("Anki import triggered successfully.");

    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNREFUSED') {
                 console.error(`Error: Connection refused. Is Anki open and AnkiConnect installed/running on ${ANKICONNECT_URL}?`);
            } else {
                 console.error(`Axios Error: ${error.message}`);
            }
        } else {
            console.error(`Error: ${error.message}`);
        }
        throw new Error("Failed to trigger Anki import.");
    }
}

export function registerAddCommand(program: Command): void {
    program
        .command("add [filePath]")
        .description("Process Markdown file, generate TSV, and trigger Anki import")
        .action(async (inputFilePathArg: string | undefined) => {
            let outputFilePath: string | undefined = undefined;
            try {
                let resolvedInputPath = inputFilePathArg ? path.resolve(process.cwd(), inputFilePathArg) : DEFAULT_INPUT_PATH;
                console.log(`Processing input file: ${resolvedInputPath}`);

                try {
                    await fs.access(resolvedInputPath, fs.constants.R_OK);
                } catch (err) {
                    console.error(`Error: Cannot read input file "${resolvedInputPath}". Check path and permissions.`);
                    throw err;
                }

                const data = await fs.readFile(resolvedInputPath, "utf8");

                const tsvOutputBody = processQuestions(data);

                if (!tsvOutputBody.trim()) {
                    console.log("No valid question blocks found or processed. No import file generated.");
                    return;
                }
                console.log(`Successfully processed ${tsvOutputBody.split('\n').length} question block(s).`);

                const headerLines = `#separator:tab\n#html:true\n#tags column:8\n`;
                const fullOutputContent = headerLines + tsvOutputBody;

                 const outputFileName = `${path.basename(resolvedInputPath, path.extname(resolvedInputPath))}_${Date.now()}_import.txt`;
                 let outputDir: string;
                 try {
                     const paths = envPaths(APP_NAME, { suffix: "" });
                     outputDir = paths.data;
                     await fs.mkdir(outputDir, { recursive: true });
                     outputFilePath = path.join(outputDir, outputFileName);
                 } catch (mkdirError) {
                     console.warn(`Warning: Could not create data directory in standard location (${(mkdirError as Error).message}). Using current working directory instead.`);
                     outputDir = process.cwd();
                     outputFilePath = path.join(outputDir, outputFileName);
                 }
                 console.log(`Generating import file at: ${outputFilePath}`);

                await fs.writeFile(outputFilePath, fullOutputContent, "utf8");

                await triggerAnkiImport(outputFilePath);

                console.log(`Successfully generated ${outputFilePath} and triggered Anki import.`);

            } catch (error: any) {
                console.error("\n--- An error occurred during the process ---");

                console.error("Operation failed. Please check the logs above for details.");
                 if (outputFilePath) {
                     try {
                         await fs.access(outputFilePath);

                     } catch (cleanupError) {

                     }
                 }
                process.exitCode = 1;
            }
        });
}