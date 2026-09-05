#!/usr/bin/env bash
# @file validate_project.sh
# @brief Run deterministic static validation before runtime testing or release.
#
# Platform : Bash / repository development environment
# Author   : Daniel Fridman (schermaiolo)
#
# This script intentionally stops at static checks. Interactive VS Code and
# Pragtical behavior is covered by the manual pre-release test checklist.

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[1/6] Character manifest and source sheets"
python tools/sync_characters.py --check

echo "[2/6] Generated character/editor metadata"
python tools/generate_characters.py --check

echo "[3/6] Python syntax"
python -m py_compile \
  tools/add_character.py \
  tools/generate_characters.py \
  tools/sync_characters.py

echo "[4/6] TypeScript type check"
(cd editors/vscode && npm run check-types)

echo "[5/6] ESLint + extension build"
(cd editors/vscode && npm run lint && npm run compile)

echo "[6/6] Extension test compilation"
(cd editors/vscode && npm run compile-tests)

echo
echo "Static validation passed."
echo "Manual VS Code and Pragtical runtime testing is still required."
