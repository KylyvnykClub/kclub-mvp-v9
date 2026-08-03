#!/usr/bin/env python3
"""Check the documentation set for the problems that prose cannot prevent.

    python tools/check-docs.py            # report; fail only on broken links
    python tools/check-docs.py --strict   # fail on warnings too (use in CI)
    python tools/check-docs.py --quiet    # summary only

Checks:
  errors    broken relative links and broken section anchors
  warnings  documents with no owner, stale "Last updated", unfilled placeholders

Standard library only. No configuration.
"""

import argparse
import datetime as dt
import os
import re
import sys

# Consider a document stale this long after its "Last updated" date.
STALE_AFTER_DAYS = 180

PLACEHOLDER = "_(fill in)_"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
HEADING_RE = re.compile(r"^#{1,6}\s+(.*?)\s*$", re.MULTILINE)
OWNER_RE = re.compile(r"^>\s*\*\*Owner:\*\*\s*(.+?)\s*$", re.MULTILINE)
UPDATED_RE = re.compile(r"^>\s*\*\*Last updated:\*\*\s*(.+?)\s*$", re.MULTILINE)


def strip_fences(body):
    """Blank out fenced code blocks, keeping line numbers intact.

    Without this, an example header or link shown inside a ``` block is read as
    if it were real - which every documentation template contains.
    """
    out, in_fence = [], False
    for line in body.split("\n"):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            out.append("")
        else:
            out.append("" if in_fence else line)
    return "\n".join(out)


def slugify(heading):
    """Reproduce GitHub's anchor generation for a heading."""
    text = heading.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"\s+", "-", text.strip())


def markdown_files():
    found = []
    for base, dirs, names in os.walk(REPO_ROOT):
        dirs[:] = [d for d in dirs if d not in {".git", "node_modules", ".venv"}]
        for name in names:
            if name.endswith(".md"):
                path = os.path.join(base, name)
                found.append(os.path.relpath(path, REPO_ROOT).replace(os.sep, "/"))
    return sorted(found)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true",
                        help="exit non-zero on warnings as well as errors")
    parser.add_argument("--quiet", action="store_true",
                        help="print the summary only")
    args = parser.parse_args()

    files = markdown_files()
    if not files:
        print("no markdown files found")
        return 1

    text = {f: open(os.path.join(REPO_ROOT, f), encoding="utf-8").read()
            for f in files}
    prose = {f: strip_fences(text[f]) for f in files}
    anchors = {f: {slugify(h) for h in HEADING_RE.findall(prose[f])} for f in files}

    errors, warnings = [], []
    checked = placeholders = 0
    today = dt.date.today()

    for f in files:
        body = prose[f]
        placeholders += text[f].count(PLACEHOLDER)
        base = os.path.dirname(f)

        for target in LINK_RE.findall(body):
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            path, _, fragment = target.partition("#")
            checked += 1
            resolved = os.path.normpath(os.path.join(base, path)).replace(os.sep, "/")
            if not os.path.exists(os.path.join(REPO_ROOT, resolved)):
                errors.append("%s -> %s (file not found)" % (f, target))
                continue
            if fragment and resolved.endswith(".md"):
                if fragment not in anchors.get(resolved, set()):
                    errors.append("%s -> %s (no such section)" % (f, target))

        owner = OWNER_RE.search(body)
        if owner and PLACEHOLDER in owner.group(1):
            warnings.append("%s has no owner" % f)

        updated = UPDATED_RE.search(body)
        if updated:
            raw = updated.group(1).strip()
            match = re.search(r"\d{4}-\d{2}-\d{2}", raw)
            if not match:
                warnings.append("%s has never been dated" % f)
            else:
                try:
                    age = (today - dt.date.fromisoformat(match.group(0))).days
                    if age > STALE_AFTER_DAYS:
                        warnings.append("%s not reviewed for %d days" % (f, age))
                except ValueError:
                    warnings.append("%s has an invalid date: %s" % (f, raw))

    if not args.quiet:
        for e in errors:
            print("ERROR   %s" % e)
        for w in warnings:
            print("WARN    %s" % w)
        if errors or warnings:
            print("")

    print("%d files | %d links checked | %d errors | %d warnings | %d placeholders"
          % (len(files), checked, len(errors), len(warnings), placeholders))

    if errors:
        return 1
    if warnings and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
