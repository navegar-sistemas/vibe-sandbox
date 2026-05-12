const PREFIX = "[sandbox-vibe]";

export function log(message: string): void {
  console.log(`${PREFIX} ${message}`);
}

export function logError(message: string): void {
  console.error(`${PREFIX} ${message}`);
}
