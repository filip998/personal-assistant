import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";

export interface LoadPromptsResult {
  /** Concatenated prompt text from all .md files */
  prompt: string;
  /** List of filenames that were loaded (in order) */
  files: string[];
}

/**
 * Load all .md files from a directory and concatenate them into a system prompt.
 * Files are read in alphabetical order and joined with double newlines.
 *
 * Returns an empty prompt (no error) if the directory is missing, empty,
 * not a directory, or unreadable.
 */
export function loadPrompts(promptsDir: string): LoadPromptsResult {
  let stat;
  try {
    stat = statSync(promptsDir);
  } catch {
    console.warn(
      `[prompts] Directory not found: ${promptsDir} — using empty prompt`
    );
    return { prompt: "", files: [] };
  }

  if (!stat.isDirectory()) {
    console.warn(
      `[prompts] Path is not a directory: ${promptsDir} — using empty prompt`
    );
    return { prompt: "", files: [] };
  }

  const entries = readdirSync(promptsDir)
    .filter((f) => extname(f).toLowerCase() === ".md")
    .sort();

  if (entries.length === 0) {
    console.warn(`[prompts] No .md files found in ${promptsDir}`);
    return { prompt: "", files: [] };
  }

  const fragments: string[] = [];
  for (const file of entries) {
    try {
      const content = readFileSync(resolve(promptsDir, file), "utf-8").trim();
      if (content) {
        fragments.push(content);
      }
    } catch (err) {
      console.warn(`[prompts] Could not read ${file}, skipping: ${err}`);
    }
  }

  console.log(
    `[prompts] Loaded ${entries.length} file(s): ${entries.join(", ")}`
  );

  return {
    prompt: fragments.join("\n\n"),
    files: entries,
  };
}
