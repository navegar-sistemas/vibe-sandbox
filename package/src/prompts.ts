import {
  input,
  select,
  confirm,
  checkbox,
  Separator,
} from "@inquirer/prompts";

export { input, select, confirm, checkbox, Separator };

// Inquirer rejects the prompt promise with `ExitPromptError` when the user
// presses Ctrl+C, and with `AbortPromptError` when an attached AbortSignal
// fires (timeout, manual cancel). Both should exit cleanly without a stack
// trace. Other Error subclasses are real failures and must propagate.
export function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "ExitPromptError" || err.name === "AbortPromptError";
}
