import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import envPaths from 'env-paths'; // Import envPaths
import { readFileSync } from 'fs'; // Needed for getAppNameFromPackageJson

// --- Constants ---
const SYSTEM_PROMPT = `
You are an advanced assistant designed to follow user-provided guidelines and perform tasks precisely as instructed. When the user provides a guidelines document or specific rules, follow these:

1. **Understand the instructions:** Carefully read and comprehend the user's guidelines or instructions.
2. **Apply the Guide:** Strictly follow the provided rules when performing the task.
3. **Perform the Task:** Use the guideline's framework to deliver the requested output.
4. **Ensure Accuracy:** Double-check your output to ensure it adheres to the user-provided guidelines.
5. **Minimal Deviation:** Do not deviate from the guide unless explicitly instructed to do so.

Your goal is to produce outputs that align perfectly with the user's expectations and guidelines.
`.trim();

const GEMINI_MODEL = 'gemini-2.0-flash'; // Model name

// --- Determine Application Paths using env-paths ---

/**
 * Determines the application name from package.json or provides a default.
 * Using the same logic as the Anki exporter for consistency.
 * @returns The application name.
 */
const getAppNameFromPackageJson = (): string => {
    try {
        // Note: __dirname might not be reliable in all JS environments (e.g., bundled code).
        // Consider alternative ways to locate package.json if this causes issues.
        const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
        const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);
        if (packageJson && typeof packageJson.name === 'string' && packageJson.name.trim() !== '') {
            return packageJson.name;
        }
        return 'anki-note-processor-default'; // Default name for this specific script
    } catch (error) {
        // Handle errors like file not found or JSON parsing issues
        // console.warn(`Could not read package.json to determine app name. Using default: anki-note-processor-default. Error: ${error}`); // Reduced output
        return 'anki-note-processor-default';
    }
};

const APP_NAME = getAppNameFromPackageJson();
const applicationPaths = envPaths(APP_NAME, { suffix: '' });

// Input and Output files are now based on the data directory from env-paths
const DATA_DIR = applicationPaths.data;
const INPUT_FILE = path.join(DATA_DIR, 'input.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'output.json');

// Define the instructions directory based on the parent of the data directory
// This assumes the 'Instructions' folder is a sibling of the 'Data' folder
const BASE_APP_DIR = path.dirname(DATA_DIR);
const INSTRUCTIONS_DIR = path.join(BASE_APP_DIR, 'Instructions');


// Gemini Setup
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error('GEMINI_API_KEY is not set in environment variables.');
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

// --- Helper Functions ---

/**
 * Resolves the full path to the instruction file.
 * It now looks for the instructions folder within the application's base directory
 * (sibling to the Data folder).
 * @param guidelinesFile The filename of the guidelines file.
 * @returns The absolute path to the instruction file.
 */
function resolveInstructionFilePath(guidelinesFile: string): string {
    // Use the defined INSTRUCTIONS_DIR as the base
    return path.join(INSTRUCTIONS_DIR, guidelinesFile);
}

/**
 * Reads the input JSON file and the instruction file.
 * Ensures the data directory and instructions directory exist before reading.
 * @param inputFilePath The path to the input JSON file.
 * @param instructionFilePath The path to the instruction file.
 * @returns A promise resolving to an object containing the instruction text and parsed input notes.
 * @throws Error if files cannot be read or JSON is invalid.
 */
async function readInputAndInstructionFiles(inputFilePath: string, instructionFilePath: string): Promise<{ instructionText: string; notes: any[] }> {
    // Ensure both data directory and instructions directory exist
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(INSTRUCTIONS_DIR, { recursive: true }); // Ensure the instructions directory exists

    const instructionText = await fs.readFile(instructionFilePath, 'utf-8');
    const inputJson = await fs.readFile(inputFilePath, 'utf-8');
    const notes = JSON.parse(inputJson);
    return { instructionText, notes };
}

/**
 * Builds the prompt string for the Gemini API.
 * @param systemPrompt The system prompt text.
 * @param instructionText The user-provided instruction text.
 * @param inputJson The content of the input JSON file as a string.
 * @returns The complete prompt string.
 */
function buildGeminiPrompt(systemPrompt: string, instructionText: string, inputJson: string): string {
    return `
<system-prompt>
${systemPrompt}
</system-prompt>

<instruction>
${instructionText.trim()}
</instruction>

<input-file>
${inputJson}
</input-file>`;
}

/**
 * Calls the Gemini API with the constructed prompt.
 * @param prompt The prompt string to send to Gemini.
 * @param model The name of the Gemini model to use.
 * @returns A promise resolving to the raw text response from Gemini.
 * @throws Error if the API call fails.
 */
async function callGeminiApi(prompt: string, model: string): Promise<string> {
    const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
    });
    return response.text ?? '';
}

/**
 * Extracts the JSON content from a markdown code block in the Gemini response.
 * @param rawText The raw text response from Gemini.
 * @returns The extracted JSON string.
 * @throws Error if no valid JSON code block is found.
 */
function extractJsonFromResponse(rawText: string): string {
    const jsonMatch = rawText.match(/```json\s*\n([\s\S]*?)\n```/i);

    if (!jsonMatch || !jsonMatch[1]) {
        const error = new Error('No valid JSON code block found in Gemini response.');
        // Optionally attach raw response for debugging
        // (error as any).rawResponse = rawText;
        throw error;
    }

    return jsonMatch[1];
}

/**
 * Writes the provided data to the output JSON file.
 * Ensures the data directory exists before writing.
 * @param outputPath The path to the output file.
 * @param data The data string to write.
 * @throws Error if writing the file fails.
 */
async function writeOutputToFile(outputPath: string, data: string): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true }); // Ensure data directory exists
    await fs.writeFile(outputPath, data, 'utf-8');
}


// --- Register Unified Command ---
export async function registerProcessWithGeminiCommand(program: Command) {
    program
        .command('process_with_gemini')
        .description('Send input.json to Gemini using specified guidelines and save JSON result to output.json')
        .option('-g, --guidelines <file>', 'Instruction file (e.g. tagging_instructions.md or gk_extra_instructions.md)', 'tagging_instructions.md')
        .action(async (options) => {
            let INSTRUCTION_FILE = ''; // Declare here for catch block access

            try {
                // Step 1: Show status header and resolve instruction file path
                INSTRUCTION_FILE = resolveInstructionFilePath(options.guidelines);
                console.log(`Processing with Gemini using guidelines: ${options.guidelines} ...`);
                // Use path.basename() to display only the filename
                console.log(`Input File: "${path.basename(INPUT_FILE)}"`);
                console.log(`Instructions File: "${path.basename(INSTRUCTION_FILE)}"`);
                console.log(`Output File: "${path.basename(OUTPUT_FILE)}"`);

                // Step 2: Read files
                // readInputAndInstructionFiles now ensures the instructions directory exists
                const { instructionText, notes } = await readInputAndInstructionFiles(INPUT_FILE, INSTRUCTION_FILE);
                console.log(`Count: ${notes.length}`); // Show total note count

                // Step 3: Build prompt
                const prompt = buildGeminiPrompt(SYSTEM_PROMPT, instructionText, JSON.stringify(notes, null, 2)); // Pass notes as stringified JSON

                // Step 4: Call Gemini API
                const rawText = await callGeminiApi(prompt, GEMINI_MODEL);

                // Step 5: Extract JSON from code block
                const extractedJson = extractJsonFromResponse(rawText);

                // Step 6: Save extracted JSON
                await writeOutputToFile(OUTPUT_FILE, extractedJson);

                // Step 7: Success
                console.log('Status: ✅');

            } catch (error: any) {
                console.error('\nStatus: ❌');
                if (error.code === 'ENOENT') {
                    // Still show the full path in the error message for easier debugging
                    console.error(`Required file not found: ${error.path}`);
                     if (error.path === INPUT_FILE) {
                         console.error(`Please ensure the input file exists at: "${INPUT_FILE}". You might need to run the 'export_notes' command first.`);
                     } else if (error.path === INSTRUCTION_FILE) {
                          console.error(`Please ensure the instruction file exists at: "${INSTRUCTION_FILE}".`);
                     }
                } else if (error.name === 'SyntaxError') {
                    console.error('Failed to parse JSON:', error.message); // More generic message as it could be input or extracted JSON
                } else {
                    console.error('Error during processing:', error.message || error);
                }
                process.exit(1);
            }
        });
}
