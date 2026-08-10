#!/usr/bin/env bash
# NOT EXECUTED — documentation-only helper for a future owner-approved staging deploy.
# Requires explicit --project buscommand-preview on every command.
# Do NOT run until Integration Checkpoint deploy is explicitly approved.

set -euo pipefail

PROJECT_ID="buscommand-preview"

echo "NOT EXECUTED — refusing to run automatically."
echo "When approved, run ONLY against Firebase project: ${PROJECT_ID}"
echo
echo "Example (NOT EXECUTED):"
echo "  firebase deploy --only firestore:rules --project ${PROJECT_ID}"
echo "  firebase deploy --only firestore:indexes --project ${PROJECT_ID}"
echo
echo "Forbidden:"
echo "  - firebase deploy without --project"
echo "  - firebase use (mutates active project selection)"
echo "  - any deploy while BUSCOMMAND_ENV is unclear"
exit 2
