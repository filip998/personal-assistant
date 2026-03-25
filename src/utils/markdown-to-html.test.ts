import { describe, it, expect } from "vitest";
import { markdownToTelegramHtml } from "./markdown-to-html.js";

describe("markdownToTelegramHtml", () => {
  describe("passthrough", () => {
    it("returns empty string for empty input", () => {
      expect(markdownToTelegramHtml("")).toBe("");
    });

    it("returns plain text unchanged (except HTML escaping)", () => {
      expect(markdownToTelegramHtml("Hello world")).toBe("Hello world");
    });
  });

  describe("HTML entity escaping", () => {
    it("escapes & < >", () => {
      expect(markdownToTelegramHtml("A & B < C > D")).toBe(
        "A &amp; B &lt; C &gt; D"
      );
    });

    it("does not double-escape inside code blocks", () => {
      const input = "```\nif (a < b && c > d) {}\n```";
      const result = markdownToTelegramHtml(input);
      expect(result).toContain("&lt;");
      expect(result).toContain("&amp;&amp;");
      expect(result).not.toContain("&amp;amp;");
    });
  });

  describe("code blocks", () => {
    it("wraps fenced code blocks in <pre><code>", () => {
      const input = "```\nconsole.log('hi');\n```";
      expect(markdownToTelegramHtml(input)).toBe(
        "<pre><code>console.log('hi');</code></pre>"
      );
    });

    it("includes language class when specified", () => {
      const input = "```typescript\nconst x: number = 1;\n```";
      expect(markdownToTelegramHtml(input)).toBe(
        '<pre><code class="language-typescript">const x: number = 1;</code></pre>'
      );
    });

    it("preserves code block contents from markdown processing", () => {
      const input = "```\n**not bold** *not italic*\n```";
      const result = markdownToTelegramHtml(input);
      expect(result).not.toContain("<b>");
      expect(result).not.toContain("<i>");
      expect(result).toContain("**not bold** *not italic*");
    });
  });

  describe("inline code", () => {
    it("wraps inline code in <code>", () => {
      expect(markdownToTelegramHtml("Use `npm install`")).toBe(
        "Use <code>npm install</code>"
      );
    });

    it("escapes HTML inside inline code", () => {
      expect(markdownToTelegramHtml("Type `<div>`")).toBe(
        "Type <code>&lt;div&gt;</code>"
      );
    });

    it("protects inline code from markdown processing", () => {
      expect(markdownToTelegramHtml("`**not bold**`")).toBe(
        "<code>**not bold**</code>"
      );
    });
  });

  describe("headings", () => {
    it("converts h1 to bold", () => {
      expect(markdownToTelegramHtml("# Title")).toBe("<b>Title</b>");
    });

    it("converts h2 to bold", () => {
      expect(markdownToTelegramHtml("## Section")).toBe("<b>Section</b>");
    });

    it("converts h3–h6 to bold", () => {
      expect(markdownToTelegramHtml("### Sub")).toBe("<b>Sub</b>");
      expect(markdownToTelegramHtml("#### Deep")).toBe("<b>Deep</b>");
      expect(markdownToTelegramHtml("##### Deeper")).toBe("<b>Deeper</b>");
      expect(markdownToTelegramHtml("###### Deepest")).toBe("<b>Deepest</b>");
    });
  });

  describe("bold", () => {
    it("converts **text** to <b>", () => {
      expect(markdownToTelegramHtml("**hello**")).toBe("<b>hello</b>");
    });

    it("handles bold in the middle of a sentence", () => {
      expect(markdownToTelegramHtml("This is **important** info")).toBe(
        "This is <b>important</b> info"
      );
    });
  });

  describe("italic", () => {
    it("converts *text* to <i>", () => {
      expect(markdownToTelegramHtml("*hello*")).toBe("<i>hello</i>");
    });

    it("does not convert asterisks inside words", () => {
      const result = markdownToTelegramHtml("file*name*here");
      // The regex uses word boundary checks — this should NOT become italic
      expect(result).not.toContain("<i>");
    });
  });

  describe("bold + italic", () => {
    it("converts ***text*** to <b><i>", () => {
      expect(markdownToTelegramHtml("***emphasis***")).toBe(
        "<b><i>emphasis</i></b>"
      );
    });
  });

  describe("strikethrough", () => {
    it("converts ~~text~~ to <s>", () => {
      expect(markdownToTelegramHtml("~~deleted~~")).toBe("<s>deleted</s>");
    });
  });

  describe("links", () => {
    it("converts [text](url) to <a>", () => {
      expect(markdownToTelegramHtml("[Google](https://google.com)")).toBe(
        '<a href="https://google.com">Google</a>'
      );
    });

    it("handles URLs with & correctly", () => {
      const input = "[link](https://example.com?a=1&b=2)";
      const result = markdownToTelegramHtml(input);
      expect(result).toContain('href="https://example.com?a=1&b=2"');
    });
  });

  describe("lists", () => {
    it("converts - items to bullet points", () => {
      const input = "- First\n- Second\n- Third";
      const result = markdownToTelegramHtml(input);
      expect(result).toContain("• First");
      expect(result).toContain("• Second");
      expect(result).toContain("• Third");
    });

    it("converts * items to bullet points", () => {
      const input = "* Alpha\n* Beta";
      const result = markdownToTelegramHtml(input);
      expect(result).toContain("• Alpha");
      expect(result).toContain("• Beta");
    });
  });

  describe("blockquotes", () => {
    it("wraps > text in <blockquote>", () => {
      const input = "> This is a quote";
      const result = markdownToTelegramHtml(input);
      expect(result).toContain("<blockquote>");
      expect(result).toContain("This is a quote");
      expect(result).toContain("</blockquote>");
    });

    it("merges consecutive > lines", () => {
      const input = "> Line one\n> Line two";
      const result = markdownToTelegramHtml(input);
      const blockquoteCount = (result.match(/<blockquote>/g) || []).length;
      expect(blockquoteCount).toBe(1);
      expect(result).toContain("Line one");
      expect(result).toContain("Line two");
    });
  });

  describe("horizontal rules", () => {
    it("converts --- to a line", () => {
      expect(markdownToTelegramHtml("---")).toBe("───────────────");
    });

    it("converts *** to a line", () => {
      expect(markdownToTelegramHtml("***")).toBe("───────────────");
    });

    it("converts ___ to a line", () => {
      expect(markdownToTelegramHtml("___")).toBe("───────────────");
    });
  });

  describe("blank line cleanup", () => {
    it("collapses 3+ blank lines to 2", () => {
      const input = "Hello\n\n\n\nWorld";
      const result = markdownToTelegramHtml(input);
      expect(result).toBe("Hello\n\nWorld");
    });
  });

  describe("tables", () => {
    it("wraps a basic markdown table in <pre> and strips the separator row", () => {
      const input = [
        "| Player | Team | Points |",
        "|--------|------|--------|",
        "| Jokic  | DEN  | 31     |",
        "| Doncic | DAL  | 28     |",
      ].join("\n");

      const result = markdownToTelegramHtml(input);

      expect(result).toBe(
        "<pre>| Player | Team | Points |\n| Jokic  | DEN  | 31     |\n| Doncic | DAL  | 28     |</pre>"
      );
      expect(result).not.toContain("|--------|");
    });

    it("does not process markdown formatting inside table cells", () => {
      const input = [
        "| Name | Status |",
        "|------|--------|",
        "| **Jokic** | *active* |",
      ].join("\n");

      const result = markdownToTelegramHtml(input);

      expect(result).toContain("**Jokic**");
      expect(result).toContain("*active*");
      expect(result).not.toContain("<b>");
      expect(result).not.toContain("<i>");
    });

    it("only wraps the table portion in <pre> when surrounded by other content", () => {
      const input = [
        "Here are the scores:",
        "",
        "| Player | Points |",
        "|--------|--------|",
        "| Jokic  | 31     |",
        "",
        "That's all.",
      ].join("\n");

      const result = markdownToTelegramHtml(input);

      expect(result).toContain("Here are the scores:");
      expect(result).toContain("<pre>| Player | Points |");
      expect(result).toContain("That's all.");
    });

    it("HTML-escapes special characters inside table cells", () => {
      const input = [
        "| Name | Value |",
        "|------|-------|",
        "| a&b  | <tag> |",
        "| c>d  | e<f   |",
      ].join("\n");

      const result = markdownToTelegramHtml(input);

      expect(result).toContain("a&amp;b");
      expect(result).toContain("&lt;tag&gt;");
      expect(result).toContain("c&gt;d");
      expect(result).toContain("e&lt;f");
    });

    it("handles a multi-row table with many data rows", () => {
      const input = [
        "| Rank | Player  | Pts |",
        "|------|---------|-----|",
        "| 1    | Jokic   | 31  |",
        "| 2    | Doncic  | 28  |",
        "| 3    | Embiid  | 27  |",
        "| 4    | Tatum   | 26  |",
        "| 5    | Edwards | 25  |",
      ].join("\n");

      const result = markdownToTelegramHtml(input);

      expect(result).toContain("| Jokic");
      expect(result).toContain("| Doncic");
      expect(result).toContain("| Embiid");
      expect(result).toContain("| Tatum");
      expect(result).toContain("| Edwards");
      expect(result).not.toContain("|------|");
      expect(result.startsWith("<pre>")).toBe(true);
    });

    it("handles real-world LLM output with a heading, text, and table", () => {
      const input = [
        "## NBA Scores",
        "",
        "Here are tonight's top performers:",
        "",
        "| Player | Team | Points |",
        "|--------|------|--------|",
        "| Jokic  | DEN  | 31     |",
        "| Doncic | DAL  | 28     |",
        "",
        "Great game tonight!",
      ].join("\n");

      const result = markdownToTelegramHtml(input);

      expect(result).toContain("<b>NBA Scores</b>");
      expect(result).toContain("Here are tonight's top performers:");
      expect(result).toContain("<pre>| Player | Team | Points |");
      expect(result).toContain("| Jokic  | DEN  | 31     |");
      expect(result).not.toContain("|--------|");
      expect(result).toContain("Great game tonight!");
    });
  });

  describe("combined / real-world LLM output", () => {
    it("handles a typical LLM response with mixed formatting", () => {
      const input = [
        "## Summary",
        "",
        "Here's what I found:",
        "",
        "- **TypeScript** is a typed superset of JavaScript",
        "- Use `tsc` to compile",
        "- See [docs](https://typescriptlang.org)",
        "",
        "```typescript",
        "const greeting: string = 'Hello';",
        "console.log(greeting);",
        "```",
        "",
        "> Note: This is important",
      ].join("\n");

      const result = markdownToTelegramHtml(input);

      expect(result).toContain("<b>Summary</b>");
      expect(result).toContain("• <b>TypeScript</b>");
      expect(result).toContain("<code>tsc</code>");
      expect(result).toContain('<a href="https://typescriptlang.org">docs</a>');
      expect(result).toContain(
        '<pre><code class="language-typescript">'
      );
      expect(result).toContain("<blockquote>");
    });

    it("handles a code-heavy response", () => {
      const input = [
        "Here's the fix:",
        "",
        "```javascript",
        "function add(a, b) {",
        "  return a + b;",
        "}",
        "```",
        "",
        "Then call it with `add(1, 2)` which returns `3`.",
      ].join("\n");

      const result = markdownToTelegramHtml(input);

      expect(result).toContain('<pre><code class="language-javascript">');
      expect(result).toContain("function add(a, b)");
      expect(result).toContain("<code>add(1, 2)</code>");
      expect(result).toContain("<code>3</code>");
    });
  });
});
