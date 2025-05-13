import { Command } from 'commander';
import envPaths from 'env-paths';
import path from 'path';
import fs, { readFileSync } from 'fs'; // Import fs and readFileSync at the top

// Function to get app name from package.json (copied from tag_check.ts)
const getAppNameFromPackageJson = (): string => {
    try {
        const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
        const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);
        if (packageJson && typeof packageJson.name === 'string' && packageJson.name.trim() !== '') {
            return packageJson.name;
        }
        return 'anki-cli-default'; // Default name if not found
    } catch (error) {
        return 'anki-cli-default'; // Default name on error
    }
};

const APP_NAME = getAppNameFromPackageJson();
const applicationPaths = envPaths(APP_NAME, { suffix: '' });
// DATA_DIR is typically like .../appName/Data, we need the parent directory
const BASE_APP_DIR = path.dirname(applicationPaths.data);

export function registerInstructionsUpdateCommand(program: Command) {
    program
        .command('instructions_update')
        .description('Copies the Instructions folder to the application data directory.')
        .action(async () => {
            console.log('Starting instructions update process...');

            const sourcePath = 'D:/Codes/anki-cli/Instructions'; // Use absolute path
            // Construct the destination path to be directly under the base app directory
            const destinationPath = path.join(BASE_APP_DIR, 'Instructions'); // Full path to base app dir + Instructions

            console.log(`Source: ${sourcePath}`);
            console.log(`Destination: ${destinationPath}`);

            try {
                // Check if source directory exists
                const sourceExists = await fs.promises.stat(sourcePath).then(() => true).catch(() => false);

                if (!sourceExists) {
                    console.error(`Error: Source directory "${sourcePath}" not found.`);
                    process.exit(1);
                }

                // Ensure the base destination directory exists (e.g., C:\Users\sayantan\AppData\Local\anki-cli)
                await fs.promises.mkdir(BASE_APP_DIR, { recursive: true });

                // Use Node.js fs.promises to copy the directory recursively
                await fs.promises.cp(sourcePath, destinationPath, { recursive: true, force: true });

                console.log('Instructions folder copied successfully.');
            } catch (error: any) {
                console.error('Failed to copy Instructions folder.');
                console.error(`Error details: ${error.message || error}`);
                process.exit(1);
            }
        });
}
