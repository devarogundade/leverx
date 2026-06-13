import { Logger } from '@nestjs/common';
import { formatError } from './format-error';

function echoToConsole(
  level: 'error' | 'warn' | 'log',
  message: string,
  err?: unknown,
): void {
  const write =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : console.log;
  write(message);
  if (level === 'error' && err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}

/** Log keeper errors to Nest logger and stdout (Docker / process logs). */
export function logKeeperError(
  logger: Logger,
  context: string,
  err: unknown,
  extra?: Record<string, string | number | boolean | undefined>,
): string {
  const message = formatError(context, err, extra);
  logger.error(message);
  echoToConsole('error', message, err);
  return message;
}

/** Log keeper warnings to Nest logger and stdout. */
export function logKeeperWarn(
  logger: Logger,
  message: string,
  err?: unknown,
  extra?: Record<string, string | number | boolean | undefined>,
): string {
  const line = err !== undefined ? formatError(message, err, extra) : message;
  logger.warn(line);
  echoToConsole('warn', line);
  return line;
}

/** Log a failed keeper task result (non-throw paths included). */
export function logTaskFailure(
  logger: Logger,
  kind: string,
  target: string,
  error: string,
): void {
  const line = `task failed | kind=${kind} target=${target} error=${error}`;
  logger.warn(line);
  echoToConsole('warn', line);
}
