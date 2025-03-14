import { execa } from "execa";
import * as fs from "fs";
import os from "os";
import chalk from "chalk";

// Global Constants
const SYNC_SERVER_PORT = 8080;
const DEFAULT_USERNAME = "testuser";
const DEFAULT_PASSWORD = "testpass";
const ANKI_EXECUTABLE_PATH = "C:\\Users\\sayantan\\AppData\\Local\\Programs\\Anki\\anki.exe";

/**
 * Get local IP dynamically
 */
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        if (iface) {
            for (const addr of iface) {
                if (addr.family === "IPv4" && !addr.internal) {
                    return addr.address;
                }
            }
        }
    }
    return "127.0.0.1"; // Fallback if no network is found
}

/**
 * Start the Anki Sync Server
 */
export async function syncAction() {
    try {
        console.log(chalk.blue("🔍 Checking Anki installation..."));

        // Check if anki.exe exists
        if (!fs.existsSync(ANKI_EXECUTABLE_PATH)) {
            throw new Error(chalk.red(`❌ Anki executable not found at: ${ANKI_EXECUTABLE_PATH}`));
        }
        console.log(chalk.green(`✅ Found Anki at: ${ANKI_EXECUTABLE_PATH}`));

        // Set environment variable for credentials
        process.env.SYNC_USER1 = `${DEFAULT_USERNAME}:${DEFAULT_PASSWORD}`;

        // Get dynamic local IP
        const localIP = getLocalIP();

        console.log(chalk.blue("🚀 Starting Anki Sync Server..."));

        // Start the sync server
        const serverProcess = execa(ANKI_EXECUTABLE_PATH, ["--syncserver"], {
            stdio: "inherit",
            env: { SYNC_USER1: process.env.SYNC_USER1 },
        });

        serverProcess.catch((error) => {
            console.error(chalk.red(`❌ Server stopped with error: ${error.message}`));
        });

        // Print connection instructions
        printInstructions(localIP);
    } catch (err) {
        console.error(err instanceof Error ? err.message : "❌ An unknown error occurred.");
    }
}

/**
 * Print connection instructions
 */

function printInstructions(localIP: string) {
    console.log(chalk.yellow("\n--- Anki Sync Server Instructions ---"));
    console.log(`📡 Sync URL: ${chalk.cyan(`http://${localIP}:${SYNC_SERVER_PORT}`)}`);
    console.log(`👤 Username: ${chalk.cyan(DEFAULT_USERNAME)}`);
    console.log(`🔑 Password: ${chalk.cyan(DEFAULT_PASSWORD)}`);
    console.log(chalk.green("\n✅ Server is now running. Press Ctrl+C to stop.\n"));
}


