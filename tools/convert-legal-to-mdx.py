#!/usr/bin/env python3
"""Convert the executed legal documents in docs/policy/ into publishable
MDX content in content/legal/.

The documents were extracted from .doc binaries in T-0.5; the extraction
escaped section numbers (`1\\.`) and hyphens (`\\-`) and lost some bullets
and quotation marks to U+FFFD. This script repairs those mechanical defects
without touching the text itself, adds the frontmatter the legal page needs
(title, version, lastUpdated, authoritative) and writes one `.mdx` file per
document. It is idempotent and re-runnable after a document is edited.

Run: python tools/convert-legal-to-mdx.py
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
POLICY_DIR = ROOT / "docs" / "policy"
OUT_DIR = ROOT / "content" / "legal"

# Slugs and bilingual titles. The three documents that start with their
# first section have no title line of their own; the titles below are the
# ones used on the public pages (requirements.md FR-093 names them).
DOCUMENTS = [
    ("1", "terms-of-use", "TERMS OF USE / УСЛОВИЯ ИСПОЛЬЗОВАНИЯ"),
    ("2", "privacy-policy", "PRIVACY POLICY / ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ"),
    ("3", "cookie-policy", "COOKIE POLICY"),
    ("4", "club-rules", "CLUB RULES / ПРАВИЛА КЛУБА"),
    ("5", "partner-rules", "PARTNER RULES"),
    (
        "6",
        "business-introduction-rules",
        "BUSINESS INTRODUCTION RULES / ПРАВИЛА BUSINESS INTRODUCTIONS",
    ),
    ("7", "refund-policy", "REFUND POLICY"),
    ("8", "disclaimer", "DISCLAIMER"),
    ("9", "contact-us", "CONTACT US / СВЯЗАТЬСЯ С НАМИ"),
]

VERSION = "1.0"
EFFECTIVE_DATE = "2026-07-01"

_HEADING_RE = re.compile(r"^(\d+)\\\. (.+)$")


def clean_line(line: str) -> str:
    """Repair one line of extracted document text."""
    stripped = line.rstrip("\n")

    # Escaped section numbers become real headings.
    m = _HEADING_RE.match(stripped)
    if m:
        return f"## {m.group(1)}. {m.group(2)}"

    # Escaped hyphens from the .doc extraction.
    stripped = stripped.replace("\\-", "-")

    # Lost bullets (line-start U+FFFD).
    if stripped.startswith("�"):
        stripped = "- " + stripped.lstrip("�").lstrip()

    # Lost quotation marks («...» pairs); drop any stray leftovers.
    stripped = re.sub(r"�([^�]+)�", r"«\1»", stripped)
    stripped = stripped.replace("�", "")

    # The extraction used a heavy dash as a section separator.
    if stripped == "⸻":
        return "---"

    return stripped


def convert(prefix: str, slug: str, title: str) -> None:
    source = POLICY_DIR / f"{prefix}-{slug}.md"
    text = source.read_text(encoding="utf-8")

    lines = text.splitlines()
    body = "\n".join(clean_line(line) for line in lines).strip() + "\n"

    frontmatter = (
        "---\n"
        f"title: {title}\n"
        f"version: \"{VERSION}\"\n"
        f"lastUpdated: \"{EFFECTIVE_DATE}\"\n"
        "authoritative: true\n"
        f"order: {prefix}\n"
        "---\n\n"
    )

    out = OUT_DIR / f"{slug}.mdx"
    out.write_text(frontmatter + body, encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)} ({len(body.splitlines())} lines)")


def main() -> None:
    if not POLICY_DIR.is_dir():
        sys.exit(f"missing {POLICY_DIR}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for prefix, slug, title in DOCUMENTS:
        convert(prefix, slug, title)


if __name__ == "__main__":
    main()
