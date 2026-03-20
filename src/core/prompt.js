// ABOUTME: Provides a stdin prompt function for interactive CLI flows.
// ABOUTME: Thin wrapper around node:readline/promises — returns an ask/close pair.
import { createInterface } from "node:readline/promises";

export function createPrompt() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  async function prompt(question) {
    return await rl.question(question + " ");
  }

  function close() {
    rl.close();
  }

  return { prompt, close };
}
