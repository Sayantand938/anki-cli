import chalk from 'chalk';
import cliSpinners from 'cli-spinners'; // ✅ import the spinners directly

export function createSpinner(initialText: string) {
  const spinner = cliSpinners.dots; // ← use the 'dots' spinner
  let intervalId: NodeJS.Timeout | null = null;
  let frameIndex = 0;
  let text = initialText;

  const start = (newText?: string) => {
    if (newText) text = newText;
    stop();
    intervalId = setInterval(() => {
      const frame = spinner.frames[frameIndex++ % spinner.frames.length];
      process.stdout.write(`\r${chalk.yellow(frame)} ${text}`);
    }, spinner.interval);
  };

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      process.stdout.write('\r\x1b[K'); // clear line
    }
  };

  const setText = (newText: string) => {
    text = newText;
  };

  return { start, stop, setText };
}
