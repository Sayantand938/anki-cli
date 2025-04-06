// src/commands/sync.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { execa } from 'execa';
import path from 'path';
import fs from 'fs';
import os from 'os';

// --- Configuration Constants ---
const SYNC_USERNAME = 'testuser';
const SYNC_PASSWORD = 'testpass';
const SYNC_HOST = '0.0.0.0';
const SYNC_PORT = '8080';

const ANKI_EXECUTABLE_PATH = path.join(
  process.env.LOCALAPPDATA || '',
  'Programs',
  'Anki',
  'anki.exe'
);

const SYNC_BASE_DIRECTORY = path.join(
  process.env.USERPROFILE || '',
  '.ankicli-syncserver'
);

export function registerSyncCommand(program: Command) {
  program.command('sync')
    .description('Starts the self-hosted Anki sync server')
    .action(handleSyncCommand);
}

async function handleSyncCommand() {
  const localIp = getLocalIpAddress();
  const connectUrl = localIp ? `http://${localIp}:${SYNC_PORT}/` : `http://127.0.0.1:${SYNC_PORT}/`;

  if (!(await checkAnkiExecutable())) {
    process.exit(1);
  }

  displayServerDetails(connectUrl);
  await startAnkiSyncServer();
}

function getLocalIpAddress(): string | null {
  const networkInterfaces = os.networkInterfaces();
  const candidates: string[] = [];

  for (const ifaceList of Object.values(networkInterfaces)) {
    for (const iface of ifaceList || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push(iface.address);
      }
    }
  }

  return candidates.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) || candidates[0] || '127.0.0.1';
}

async function checkAnkiExecutable(): Promise<boolean> {
  try {
    await fs.promises.access(ANKI_EXECUTABLE_PATH, fs.constants.X_OK);
    return true;
  } catch {
    console.error(chalk.red(`❌ Error: Anki executable not found at:`));
    console.error(chalk.red(`   ${ANKI_EXECUTABLE_PATH}`));
    return false;
  }
}

async function displayServerDetails(connectUrl: string) {
  const boxenModule = await import('boxen');
  const boxen = boxenModule.default;

  const boxContent = `
${chalk.greenBright.bold('Anki Sync Server is Ready!')}

🔗 ${chalk.bold('Link:')}     ${chalk.cyanBright(connectUrl)}
👤 ${chalk.bold('Username:')} ${chalk.yellowBright(SYNC_USERNAME)}
🔑 ${chalk.bold('Password:')} ${chalk.yellowBright(SYNC_PASSWORD)}

${chalk.gray(`Data directory: ${SYNC_BASE_DIRECTORY}`)}
  `.trim();

  console.log(boxen(boxContent, {
    padding: 1,
    borderStyle: 'round',
    borderColor: 'cyan',
    title: 'Anki Sync Server Details',
    titleAlignment: 'center'
  }));
}

async function startAnkiSyncServer() {
  try {
    console.log(chalk.blue('Starting Anki sync server process... (Press Ctrl+C to stop)'));
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

    await serverProcess;
    console.log(chalk.green('\n✅ Anki sync server process finished normally.'));
    process.exit(0);
  } catch (error: any) {
    handleSyncServerError(error);
  }
}

function handleSyncServerError(error: any) {
  if (error.isCanceled) {
    console.log(chalk.yellow('\n🛑 Anki sync server stopped by user.'));
    process.exit(0);
  } else {
    console.error(chalk.red('\n❌ Anki server process failed.'));
    if (error.stderr) console.error(chalk.red(error.stderr.trim()));
    if (error.shortMessage) console.error(chalk.red(`Error: ${error.shortMessage}`));
    if (typeof error.exitCode === 'number') console.error(chalk.red(`Exit Code: ${error.exitCode}`));
    process.exit(1);
  }
}