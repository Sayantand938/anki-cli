// src/commands/add.ts
import type { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import envPaths from "env-paths";
import axios from "axios";

const ANKICONNECT_URL = "http://127.0.0.1:8765";
const APP_NAME = "anki-cli-import";
const DEFAULT_INPUT_PATH = "D:\\OBSIDIAN\\Untitled.md"; // Consider making this more cross-platform if needed

function removeMarkdownFormatting(text: string): string {
    if (typeof text !== 'string') return '';
    // Remove bold
    text = text.replace(/\*\*(.*?)\*\*/g, '$1');
    // Add more rules here if needed (e.g., italics)
    return text;
}

function formatLaTeX(text: string): string {
    if (typeof text !== 'string') return '';
    // Convert inline math $...$ to \(...\)
    text = text.replace(/(?<!\\)\$(.*?)(?<!\\)\$/g, '\\($1\\)');
    // Convert display math $$...$$ to \[...\]
    text = text.replace(/(?<!\\)\$\$(.*?)(?<!\\)\$\$/g, '\\[$1\\]');
    return text;
}

function extractTags(input: string): string {
    const tagsMatch = input.match(/```tags\s+([\s\S]*?)```/);
    return tagsMatch ? tagsMatch[1].trim().replace(/\n+/g, ' ') : 'untagged';
}

function convertMarkdownImagesToHtml(text: string): string {
    if (typeof text !== 'string') return '';
    // Convert ![alt](src) to <img src="src" alt="alt">
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
            .map(line => line.replace(/```/g, '').trim()) // Remove potential code block fences
            .map(line => removeMarkdownFormatting(line))
            .map(line => convertMarkdownImagesToHtml(line))
            .map(line => formatLaTeX(line)) // Also format LaTeX in Extra
            .filter(line => line !== ''); // Remove empty lines
        formattedExtraText = processedLines.join('<br>'); // Join with HTML line breaks
    }

    return { questionText: questionMatch ? questionMatch[1] : '', extraText: formattedExtraText };
}


function processQuestionBlock(block: string, tags: string): string {
    const { questionText: rawQuestionText, extraText } = extractQuestionSections(block);

    if (!rawQuestionText) return ''; // No question text found

    const allLines = rawQuestionText.split('\n').map(line => line.trim()).filter(line => line !== '');
    if (allLines.length < 5) return ''; // Need at least question + 4 options

    const numOptions = 4;
    // Ensure we don't slice negatively if there aren't enough lines
    if (allLines.length < numOptions) return '';
    const rawOptions = allLines.slice(-numOptions);
    const questionLines = allLines.slice(0, allLines.length - numOptions);

    // Process Question Part
    let processedQuestion = questionLines.join('<br>'); // Join lines with HTML breaks
    processedQuestion = removeMarkdownFormatting(processedQuestion);
    processedQuestion = convertMarkdownImagesToHtml(processedQuestion);
    processedQuestion = formatLaTeX(processedQuestion);

    // Find Correct Answer (must have ✅)
    const correctAnswerIndex = rawOptions.findIndex(option => option.includes('✅')) + 1; // 1-based index
    if (correctAnswerIndex === 0) return ''; // No correct answer marked

    // Process Options
    const finalOptions = rawOptions.map(option => {
        let processedOption = option.replace('✅', '').replace(/^-\s*/, '').trim(); // Remove ✅ and leading '- '
        processedOption = removeMarkdownFormatting(processedOption);
        processedOption = convertMarkdownImagesToHtml(processedOption);
        processedOption = formatLaTeX(processedOption);
        return processedOption;
    });

    // Ensure exactly 4 options, padding with empty strings if needed
    while (finalOptions.length < numOptions) finalOptions.push('');

    // Assemble the 10 columns in the desired order
    const outputColumns = [
        '-',                          // Column 1 (Index 0) - Hyphen
        processedQuestion,            // Column 2 (Index 1) - Question
        finalOptions[0],              // Column 3 (Index 2) - Option 1
        finalOptions[1],              // Column 4 (Index 3) - Option 2
        finalOptions[2],              // Column 5 (Index 4) - Option 3
        finalOptions[3],              // Column 6 (Index 5) - Option 4
        correctAnswerIndex.toString(),// Column 7 (Index 6) - Correct Index (as string)
        extraText,                    // Column 8 (Index 7) - Extra Info
        '',                           // Column 9 (Index 8) - Blank
        tags                          // Column 10 (Index 9) - Tags
    ];

    // Join columns with Tab separators
    return outputColumns.join('\t');
}


function processQuestions(input: string): string {
    // Split by ```Q-\d+\s* including potential trailing whitespace/newlines
    const blocks = input.split(/```Q-\d+\s*/).filter(block => block.trim() !== "");
    const tags = extractTags(input); // Extract tags once from the whole input

    // Check if the first "block" is actually content before the first question marker
    let validBlocks = blocks;
    if (blocks.length > 0 && !blocks[0].includes("<===================={QUESTION}====================>")) {
        // If the first chunk doesn't look like a question structure, skip it
        validBlocks = blocks.slice(1);
    }

    return validBlocks
        .map(block => processQuestionBlock(block, tags)) // Process each block
        .filter(line => line !== "") // Filter out any empty lines from failed processing
        .join("\n"); // Join the valid TSV lines with newlines
}

async function triggerAnkiImport(filePath: string): Promise<void> {
    // Convert Windows paths to forward slashes for AnkiConnect/JSON if necessary
    const ankiPath = filePath.replace(/\\/g, '/');
    const payload = {
        action: "guiImportFile",
        version: 6,
        params: { path: ankiPath }
    };

    try {
        console.log(`Attempting to trigger Anki import for: ${ankiPath}`);
        const response = await axios.post(ANKICONNECT_URL, payload);

        // Check AnkiConnect's response for errors
        if (response.data.error) {
            throw new Error(`AnkiConnect Error: ${response.data.error}`);
        }
        console.log("Anki import triggered successfully.");

    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            // Handle specific network errors
            if (error.code === 'ECONNREFUSED') {
                 console.error(`Error: Connection refused. Is Anki open and AnkiConnect installed/running on ${ANKICONNECT_URL}?`);
            } else {
                 console.error(`Axios Error: ${error.message}`); // Other network/HTTP errors
            }
        } else {
            // Handle errors thrown from the try block (e.g., AnkiConnect error)
            console.error(`Error: ${error.message}`);
        }
        // Indicate failure for potential scripting
        throw new Error("Failed to trigger Anki import.");
    }
}

export function registerAddCommand(program: Command): void {
    program
        .command("add [filePath]")
        .description("Process Markdown file, generate TSV, and trigger Anki import")
        .action(async (inputFilePathArg: string | undefined) => {
            let outputFilePath: string | undefined = undefined; // Keep track for potential cleanup/logging
            try {
                // Determine input file path (argument or default)
                let resolvedInputPath = inputFilePathArg ? path.resolve(process.cwd(), inputFilePathArg) : DEFAULT_INPUT_PATH;
                console.log(`Processing input file: ${resolvedInputPath}`);

                // Check if input file exists and is readable
                try {
                    await fs.access(resolvedInputPath, fs.constants.R_OK);
                } catch (err) {
                    console.error(`Error: Cannot read input file "${resolvedInputPath}". Check path and permissions.`);
                    throw err; // Stop execution
                }

                // Read the Markdown file content
                const data = await fs.readFile(resolvedInputPath, "utf8");

                // Process the content to get TSV data lines
                const tsvOutputBody = processQuestions(data);

                // Check if any valid questions were found
                if (!tsvOutputBody.trim()) {
                    console.log("No valid question blocks found or processed. No import file generated.");
                    return; // Exit successfully, nothing to import
                }
                console.log(`Successfully processed ${tsvOutputBody.split('\n').length} question block(s).`);

                // Define the header lines for the TSV file with the new tags column
                const headerLines = `#separator:tab\n#html:true\n#tags column:10\n`;

                // Combine headers and body
                const fullOutputContent = headerLines + tsvOutputBody;

                 // Determine output directory and file name
                 const outputFileName = `${path.basename(resolvedInputPath, path.extname(resolvedInputPath))}_${Date.now()}_import.txt`;
                 let outputDir: string;
                 try {
                     // Try to use the standard app data directory
                     const paths = envPaths(APP_NAME, { suffix: "" });
                     outputDir = paths.data;
                     await fs.mkdir(outputDir, { recursive: true }); // Ensure directory exists
                     outputFilePath = path.join(outputDir, outputFileName);
                 } catch (mkdirError) {
                     // Fallback to current working directory if data dir fails
                     console.warn(`Warning: Could not create data directory in standard location (${(mkdirError as Error).message}). Using current working directory instead.`);
                     outputDir = process.cwd();
                     outputFilePath = path.join(outputDir, outputFileName);
                 }
                 console.log(`Generating import file at: ${outputFilePath}`);

                // Write the combined content to the output file
                await fs.writeFile(outputFilePath, fullOutputContent, "utf8");

                // Trigger the Anki import via AnkiConnect
                await triggerAnkiImport(outputFilePath);

                console.log(`Successfully generated ${outputFilePath} and triggered Anki import.`);

            } catch (error: any) {
                console.error("\n--- An error occurred during the process ---");
                // Log the error already happened in triggerAnkiImport or reading/writing files
                console.error("Operation failed. Please check the logs above for details.");
                 // Optional: Log if the output file was created before the error
                 if (outputFilePath) {
                     try {
                         await fs.access(outputFilePath);
                         // console.log(`Note: Output file ${outputFilePath} might have been created but the process failed afterwards.`);
                         // Decide if you want to delete it on failure: await fs.unlink(outputFilePath);
                     } catch (cleanupError) {
                         // File likely wasn't created or already deleted
                     }
                 }
                // Set exit code to indicate failure in scripts
                process.exitCode = 1;
            }
        });
}