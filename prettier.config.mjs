import compactMarkdownTable from "prettier-plugin-compact-markdown-table";

/** @type {import("prettier").Config} */
export default {
  // Match .gitattributes — avoids spurious CRLF diffs on Windows.
  endOfLine: "lf",

  // docs/documentation.md §4: one sentence per line where practical.
  // "preserve" keeps author line breaks; Prettier still normalises lists,
  // tables, blockquotes and fenced blocks.
  proseWrap: "preserve",

  tabWidth: 2,
  useTabs: false,

  // No column padding — keeps table rows short enough to read without the
  // editor soft-wrapping them into a broken pipe layout.
  tableLayout: "compact",

  plugins: [compactMarkdownTable],

  overrides: [
    {
      files: ["*.md", "*.mdx"],
      options: {
        proseWrap: "preserve",
        tableLayout: "compact",
      },
    },
  ],
};
