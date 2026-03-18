import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { loadPrompts } from "./prompt-loader.js";

const TEST_DIR = resolve(import.meta.dirname, "../../.test-prompts");

describe("loadPrompts", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("returns empty prompt when directory does not exist", () => {
    const result = loadPrompts(resolve(TEST_DIR, "nonexistent"));
    expect(result.prompt).toBe("");
    expect(result.files).toEqual([]);
  });

  it("returns empty prompt when directory is empty", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const result = loadPrompts(TEST_DIR);
    expect(result.prompt).toBe("");
    expect(result.files).toEqual([]);
  });

  it("loads a single .md file", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(resolve(TEST_DIR, "SOUL.md"), "You are helpful.");

    const result = loadPrompts(TEST_DIR);
    expect(result.prompt).toBe("You are helpful.");
    expect(result.files).toEqual(["SOUL.md"]);
  });

  it("loads multiple .md files in alphabetical order", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(resolve(TEST_DIR, "TOOLS.md"), "Use web_search.");
    writeFileSync(resolve(TEST_DIR, "SOUL.md"), "Be friendly.");
    writeFileSync(resolve(TEST_DIR, "CONTEXT.md"), "User is Filip.");

    const result = loadPrompts(TEST_DIR);
    expect(result.files).toEqual(["CONTEXT.md", "SOUL.md", "TOOLS.md"]);
    expect(result.prompt).toBe(
      "User is Filip.\n\nBe friendly.\n\nUse web_search."
    );
  });

  it("ignores non-.md files", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(resolve(TEST_DIR, "SOUL.md"), "Hello.");
    writeFileSync(resolve(TEST_DIR, "notes.txt"), "Ignored.");
    writeFileSync(resolve(TEST_DIR, "config.json"), "{}");

    const result = loadPrompts(TEST_DIR);
    expect(result.files).toEqual(["SOUL.md"]);
    expect(result.prompt).toBe("Hello.");
  });

  it("skips empty .md files without adding blank fragments", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(resolve(TEST_DIR, "A.md"), "First.");
    writeFileSync(resolve(TEST_DIR, "B.md"), "   \n  \n  ");
    writeFileSync(resolve(TEST_DIR, "C.md"), "Third.");

    const result = loadPrompts(TEST_DIR);
    expect(result.files).toEqual(["A.md", "B.md", "C.md"]);
    expect(result.prompt).toBe("First.\n\nThird.");
  });

  it("trims whitespace from file contents", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(resolve(TEST_DIR, "SOUL.md"), "\n  Hello world.  \n\n");

    const result = loadPrompts(TEST_DIR);
    expect(result.prompt).toBe("Hello world.");
  });

  it("handles case-insensitive .MD extension", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(resolve(TEST_DIR, "README.MD"), "Upper case ext.");

    const result = loadPrompts(TEST_DIR);
    expect(result.files).toEqual(["README.MD"]);
    expect(result.prompt).toBe("Upper case ext.");
  });

  it("returns empty prompt when path is a file, not a directory", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const filePath = resolve(TEST_DIR, "not-a-dir.txt");
    writeFileSync(filePath, "I am a file");

    const result = loadPrompts(filePath);
    expect(result.prompt).toBe("");
    expect(result.files).toEqual([]);
  });

  it("skips unreadable .md files without crashing", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(resolve(TEST_DIR, "A.md"), "First.");
    writeFileSync(resolve(TEST_DIR, "B.md"), "Second.");

    // Make B.md unreadable (only works on Unix-like systems)
    const { chmodSync } = require("node:fs");
    chmodSync(resolve(TEST_DIR, "B.md"), 0o000);

    const result = loadPrompts(TEST_DIR);
    expect(result.files).toEqual(["A.md", "B.md"]);
    // Should still have the readable file's content
    expect(result.prompt).toContain("First.");

    // Restore permissions for cleanup
    chmodSync(resolve(TEST_DIR, "B.md"), 0o644);
  });
});
