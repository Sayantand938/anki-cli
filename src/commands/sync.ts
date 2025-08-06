// src/commands/sync.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { execa } from 'execa';
import fs from 'fs/promises';
import os from 'os';

import { logger } from '../utils/logger.js';
import { SYNC_USERNAME, SYNC_PASSWORD, SYNC_HOST, SYNC_PORT } from '../config/sync.js';
import { ANKI_EXECUTABLE_PATH, SYNC_BASE_DIRECTORY } from '../config/paths.js';

// Get local IP (prefer private IPs)
function getLocalIpAddress(): string {
  const networkInterfaces = Object.values(os.networkInterfaces()).flat();
  const candidates = networkInterfaces
    .filter((iface): iface is os.NetworkInterfaceInfoIPv4 => !!iface && iface.family === 'IPv4' && !iface.internal)
    .map(iface => iface.address);

  return (
    candidates.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) ||
    candidates[0] ||
    '127.0.0.1'
  );
}

// Check if Anki executable exists and is executable
async function checkAnkiExecutable(): Promise<void> {
  try {
    await fs.access(ANKI_EXECUTABLE_PATH, fs.constants.X_OK);
  } catch {
    throw new Error(
      `Anki executable not found or not executable at: ${chalk.dim(ANKI_EXECUTABLE_PATH)}\n  ${chalk.yellow(
        'Please check the path in src/config/paths.ts.',
      )}`,
    );
  }
}

// Print sync server info
function displayServerDetails(connectUrl: string): void {
  logger.success('Anki Sync Server Ready!');
  logger.log('----');
  logger.log(chalk.bold('Server Details:'));
  logger.log(`  Link:      ${chalk.cyanBright(connectUrl)}`);
  logger.log(`  Username:  ${chalk.yellowBright(SYNC_USERNAME)}`);
  logger.log(`  Password:  ${chalk.yellowBright(SYNC_PASSWORD)}`);
  logger.log('----');
}

// Handle graceful shutdown
function setupGracefulShutdown(serverProcess: ReturnType<typeof execa>): void {
  process.on('SIGINT', () => {
    logger.warn('\nShutdown signal received, attempting to stop Anki sync server...');
    if (!serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      setTimeout(() => {
        if (!serverProcess.killed) {
          logger.error('Server did not respond to SIGTERM, forcing shutdown...');
          serverProcess.kill('SIGKILL');
        }
      }, 2000);
    }
  });
}

// Start sync server
async function startAnkiSyncServer(): Promise<void> {
  await fs.mkdir(SYNC_BASE_DIRECTORY, { recursive: true });
  logger.info('Starting Anki sync server (press Ctrl+C to stop)...');

  const serverProcess = execa(ANKI_EXECUTABLE_PATH, ['--syncserver'], {
    env: {
      ...process.env,
      SYNC_USER1: `${SYNC_USERNAME}:${SYNC_PASSWORD}`,
      SYNC_BASE: SYNC_BASE_DIRECTORY,
      SYNC_HOST: SYNC_HOST,
      SYNC_PORT: SYNC_PORT,
    },
    stdio: 'inherit',
    windowsHide: false,
  });

  setupGracefulShutdown(serverProcess);

  try {
    await serverProcess;
    logger.success('Anki sync server process finished normally.');
  } catch (error: any) {
    if (error.isCanceled) {
      logger.info('Anki sync server stopped.');
      return;
    }
    throw new Error(`Anki sync server process failed: ${error.shortMessage}`);
  }
}

// CLI command definition
const syncCmd = new Command('sync')
  .description('Starts a self-hosted Anki sync server using the local Anki installation')
  .action(async () => {
    await checkAnkiExecutable();
    const localIp = getLocalIpAddress();
    const connectUrl = `http://${localIp}:${SYNC_PORT}/`;
    displayServerDetails(connectUrl);
    await startAnkiSyncServer();
  });

export default syncCmd;