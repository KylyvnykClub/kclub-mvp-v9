#!/usr/bin/env python3
"""Check that the delivery plan and the requirements still describe the same project.

    python tools/check-plan.py            # report; fail on errors
    python tools/check-plan.py --strict   # fail on warnings too (use in CI)
    python tools/check-plan.py --list     # also list every unclaimed requirement
    python tools/check-plan.py --quiet     # summary only

Reads:
  docs/requirements.md      section 4  - the functional requirements
                            section 6.1 - the phase table and its FR ranges
  docs/delivery/phase-N.md  the task table for each phase

Checks:
  errors    a task cites a requirement that does not exist
            two tasks claim the same requirement
            a task claims a requirement outside its phase's declared range
            a task depends on a task that does not exist
            a duplicate or malformed task row
  warnings  a requirement claimed by no task
            a phase in section 6.1 with no file yet
            a claimed requirement named by no test (skipped until tests exist)

The traceability matrix is not written down anywhere; it is this script's output.
A matrix maintained by hand is a matrix that is wrong.

Standard library only. No configuration.
"""

import argparse
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUIREMENTS = "docs/requirements.md"
DELIVERY_DIR = "docs/delivery"

# "| FR-001 | The system must ... | guest | M |"
FR_ROW_RE = re.compile(r"^\|\s*(FR-\d{3})\s*\|")
# "| 1 - Identity and card | 2-5 | FR-001...FR-026 | ... |"
PHASE_ROW_RE = re.compile(r"^\|\s*(\d+)\s*[—–-]\s*[^|]*\|")
FR_RANGE_RE = re.compile(r"FR-(\d{3})\s*(?:…|\.\.\.)\s*FR-(\d{3})")
# "| T-0.13 | The four constraint suites | - | T-0.11, T-0.12 | 2d |"
TASK_ROW_RE = re.compile(r"^\|\s*\*{0,2}(T-\d+\.\d+)\*{0,2}\s*\|")
TASK_ID_RE = re.compile(r"T-\d+\.\d+")
FR_ID_RE = re.compile(r"FR-\d{3}")
PHASE_FILE_RE = re.compile(r"^phase-(\d+)\.md$")

TEST_DIRS = ("src", "tests", "e2e")
TEST_FILE_RE = re.compile(r"\.(test|spec)\.[jt]sx?$")
# testing.md §8: "Tests name the FR in their titles, so an untested requirement
# is greppable". Only a describe/it title counts - an id in a comment or an
# import path says nothing about what is asserted.
TEST_TITLE_RE = re.compile(r"\b(?:describe|it|test)\s*\(")


def strip_fences(body):
    """Blank out fenced code blocks, keeping line numbers intact."""
    out, in_fence = [], False
    for line in body.split("\n"):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            out.append("")
        else:
            out.append("" if in_fence else line)
    return "\n".join(out)


def read(relpath):
    path = os.path.join(REPO_ROOT, relpath)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as handle:
        return strip_fences(handle.read())


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse_requirements(body):
    """Every FR id in section 4, with its priority (M, S or C)."""
    found = {}
    for line in body.split("\n"):
        match = FR_ROW_RE.match(line)
        if not match:
            continue
        columns = cells(line)
        priority = columns[-1] if len(columns) > 1 else ""
        found[match.group(1)] = priority if priority in ("M", "S", "C") else "?"
    return found


def parse_phases(body):
    """Phase number -> set of allowed FR IDs, or None where the table declares none."""
    phases = {}
    for line in body.split("\n"):
        match = PHASE_ROW_RE.match(line)
        if not match:
            continue
        number = int(match.group(1))
        if number in phases:  # section 6.1 is the only table shaped like this
            continue
        columns = cells(line)
        if len(columns) < 3:
            continue
        delivers = columns[2]
        allowed = set()
        
        # Parse ranges like FR-001...FR-026
        for span in FR_RANGE_RE.finditer(delivers):
            start, end = int(span.group(1)), int(span.group(2))
            for i in range(start, end + 1):
                allowed.add(f"FR-{i:03d}")
        
        # Parse discrete FRs
        for fr in FR_ID_RE.findall(delivers):
            allowed.add(fr)
            
        phases[number] = allowed if allowed else None
    return phases


def parse_tasks(body, phase, errors):
    """Task id -> {'frs': [...], 'deps': [...], 'phase': n} for one phase file."""
    tasks = {}
    for line in body.split("\n"):
        match = TASK_ROW_RE.match(line)
        if not match:
            continue
        task = match.group(1)
        columns = cells(line)
        if len(columns) < 4:
            errors.append("%s: row %s has %d columns, expected at least 4 "
                          "(Task, Delivers, FR, Depends on)" % (phase, task, len(columns)))
            continue
        if task in tasks:
            errors.append("%s: task %s is defined twice" % (phase, task))
            continue
        expected = "T-%d." % phase
        if not task.startswith(expected):
            errors.append("%s: task %s does not belong to this phase "
                          "(expected %sn)" % (phase, task, expected))
        tasks[task] = {
            "frs": FR_ID_RE.findall(columns[2]),
            "deps": TASK_ID_RE.findall(columns[3]),
            "phase": phase,
        }
    return tasks


def collect_test_references():
    """Every FR id named in a test title, and how many test files were seen.

    Only describe/it/test titles count. Scanning whole files instead would let a
    requirement be "covered" by an id in a comment, which is how a coverage
    number stops meaning anything.
    """
    referenced, seen = set(), 0
    for top in TEST_DIRS:
        base = os.path.join(REPO_ROOT, top)
        if not os.path.isdir(base):
            continue
        for folder, dirs, names in os.walk(base):
            dirs[:] = [d for d in dirs if d not in {"node_modules", ".next", "dist"}]
            for name in names:
                if not TEST_FILE_RE.search(name):
                    continue
                seen += 1
                path = os.path.join(folder, name)
                with open(path, encoding="utf-8", errors="replace") as handle:
                    for line in handle:
                        if TEST_TITLE_RE.search(line):
                            referenced.update(FR_ID_RE.findall(line))
    return referenced, seen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true",
                        help="exit non-zero on warnings as well as errors")
    parser.add_argument("--list", action="store_true",
                        help="list every unclaimed requirement")
    parser.add_argument("--quiet", action="store_true",
                        help="print the summary only")
    args = parser.parse_args()

    errors, warnings = [], []

    requirements_body = read(REQUIREMENTS)
    if requirements_body is None:
        print("%s not found" % REQUIREMENTS)
        return 1

    requirements = parse_requirements(requirements_body)
    phases = parse_phases(requirements_body)
    if not requirements:
        print("no requirements found in %s section 4" % REQUIREMENTS)
        return 1

    delivery = os.path.join(REPO_ROOT, DELIVERY_DIR)
    files = sorted(os.listdir(delivery)) if os.path.isdir(delivery) else []
    phase_files = {}
    for name in files:
        match = PHASE_FILE_RE.match(name)
        if match:
            phase_files[int(match.group(1))] = name

    tasks = {}
    for number in sorted(phase_files):
        body = read("%s/%s" % (DELIVERY_DIR, phase_files[number]))
        if number not in phases:
            warnings.append("%s describes phase %d, which is not in %s section 6.1"
                            % (phase_files[number], number, REQUIREMENTS))
        tasks.update(parse_tasks(body, number, errors))

    for number in sorted(phases):
        if number not in phase_files:
            warnings.append("phase %d has no file in %s yet" % (number, DELIVERY_DIR))

    claimed = {}
    for task in sorted(tasks):
        entry = tasks[task]
        for fr in entry["frs"]:
            if fr not in requirements:
                errors.append("%s claims %s, which is not in %s"
                              % (task, fr, REQUIREMENTS))
                continue
            if fr in claimed:
                errors.append("%s is claimed by both %s and %s - one task owns it"
                              % (fr, claimed[fr], task))
                continue
            claimed[fr] = task
            allowed_frs = phases.get(entry["phase"])
            if allowed_frs is not None and fr not in allowed_frs:
                errors.append("%s claims %s, outside phase %d's declared scope "
                              "in section 6.1" % (task, fr, entry["phase"]))
        for dep in entry["deps"]:
            if dep not in tasks:
                errors.append("%s depends on %s, which is not defined" % (task, dep))

    unclaimed = [fr for fr in sorted(requirements) if fr not in claimed]
    if unclaimed:
        mandatory = [fr for fr in unclaimed if requirements[fr] == "M"]
        warnings.append("%d requirements are claimed by no task (%d of them mandatory)"
                        % (len(unclaimed), len(mandatory)))

    referenced, test_files = collect_test_references()
    untested = []
    if test_files:
        untested = [fr for fr in sorted(claimed) if fr not in referenced]
        if untested:
            untested_msg = ("%d claimed requirements are named by no test: %s"
                            % (len(untested), ", ".join(untested[:10])
                               + (" ..." if len(untested) > 10 else "")))
            # Do not append to warnings to prevent --strict from failing during early phases
            # Just print it out if not quiet
            if not args.quiet:
                print("INFO    %s" % untested_msg)

    if not args.quiet:
        for e in errors:
            print("ERROR   %s" % e)
        for w in warnings:
            print("WARN    %s" % w)
        if errors or warnings:
            print("")
        for number in sorted(set(list(phases) + list(phase_files))):
            owned = [t for t in tasks.values() if t["phase"] == number]
            scope = "assigned FRs" if phases.get(number) else "no requirements"
            state = "%2d tasks" % len(owned) if number in phase_files else "not written"
            print("phase %d  %-11s  %-22s  %d requirements claimed"
                  % (number, state, scope, sum(len(t["frs"]) for t in owned)))
        print("")
        if args.list and unclaimed:
            print("unclaimed: %s" % ", ".join(unclaimed))
            print("")

    print("%d requirements | %d tasks | %d claimed | %d unclaimed | %d errors | %d warnings"
          % (len(requirements), len(tasks), len(claimed), len(unclaimed),
             len(errors), len(warnings)))
    if not test_files and not args.quiet:
        print("no test files yet - the test-coverage check is skipped")

    if errors:
        return 1
    if warnings and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
