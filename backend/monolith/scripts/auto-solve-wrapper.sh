#!/bin/bash
################################################################################
# Auto-Solve Wrapper Script
# Issue #1809 - Auto-resolve with /solve and Telegram notifications
# Issue #1853 - Auto-execute solve fix: run as hive user, send notifications
#
# This script wraps the solve command to provide:
# 1. Execution of solve command
# 2. Capture of exit code and results
# 3. Telegram notification to admins when solve completes successfully
#
# Usage: auto-solve-wrapper.sh <issue_url>
#
# Environment variables:
#   GITHUB_OWNER - GitHub repository owner (default: unidel2035)
#   GITHUB_REPO - GitHub repository name (default: dronedoc2025)
#   TELEGRAM_BOT_DIR - Path to telegram-bot directory (default: auto-detected)
#   TELEGRAM_BOT_TOKEN - Telegram bot token (required for notifications)
#   ADMIN_USERS - Comma-separated list of admin user IDs (required for notifications)
################################################################################

set -euo pipefail

# Configuration
ISSUE_URL="${1:-}"
GITHUB_OWNER="${GITHUB_OWNER:-unidel2035}"
GITHUB_REPO="${GITHUB_REPO:-dronedoc2025}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TELEGRAM_BOT_DIR="${TELEGRAM_BOT_DIR:-$PROJECT_ROOT/backend/telegram-bot}"
TELEGRAM_NOTIFY_SCRIPT="$TELEGRAM_BOT_DIR/notify_auto_solve_complete.py"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

# Validate arguments
if [ -z "$ISSUE_URL" ]; then
    log_error "Usage: $0 <issue_url>"
    log_error "Example: $0 https://github.com/unidel2035/dronedoc2025/issues/1809"
    exit 1
fi

# Extract issue number from URL
ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -oP 'issues/\K[0-9]+')
if [ -z "$ISSUE_NUMBER" ]; then
    log_error "Failed to extract issue number from URL: $ISSUE_URL"
    exit 1
fi

log_info "Starting auto-solve for issue #$ISSUE_NUMBER"
log_info "Issue URL: $ISSUE_URL"
log_info "Repository: $GITHUB_OWNER/$GITHUB_REPO"

# Find solve command location
SOLVE_CMD=""
if [ -x "/home/hive/.bun/bin/solve" ]; then
    SOLVE_CMD="/home/hive/.bun/bin/solve"
elif command -v solve &> /dev/null; then
    SOLVE_CMD=$(command -v solve)
else
    log_error "/solve command not found in PATH"
    log_error "Please ensure hive-mind is installed"
    exit 1
fi

log_info "Using solve command: $SOLVE_CMD"

# Execute /solve command
log_info "Executing /solve command..."
SOLVE_EXIT_CODE=0
SOLVE_OUTPUT=""
SOLVE_ERROR=""

# Run /solve and capture output
if SOLVE_OUTPUT=$("$SOLVE_CMD" "$ISSUE_URL" 2>&1); then
    SOLVE_EXIT_CODE=0
    log_info "/solve completed successfully"
else
    SOLVE_EXIT_CODE=$?
    SOLVE_ERROR="$SOLVE_OUTPUT"
    log_error "/solve failed with exit code $SOLVE_EXIT_CODE"
fi

# Extract PR information from solve output (if available)
PR_NUMBER=""
PR_URL=""

# Try to extract PR number and URL from output
# Pattern 1: "Created PR #1234: https://github.com/..."
if echo "$SOLVE_OUTPUT" | grep -q "Pull Request.*#[0-9]*"; then
    PR_NUMBER=$(echo "$SOLVE_OUTPUT" | grep -oP 'Pull Request.*#\K[0-9]+' | head -1)
    PR_URL=$(echo "$SOLVE_OUTPUT" | grep -oP 'https://github.com/[^\s]+/pull/[0-9]+' | head -1)
fi

# Pattern 2: Look for PR URL in output
if [ -z "$PR_URL" ]; then
    PR_URL=$(echo "$SOLVE_OUTPUT" | grep -oP 'https://github.com/[^\s]+/pull/[0-9]+' | head -1 || echo "")
    if [ -n "$PR_URL" ]; then
        PR_NUMBER=$(echo "$PR_URL" | grep -oP 'pull/\K[0-9]+')
    fi
fi

log_info "Solve results:"
log_info "  Exit code: $SOLVE_EXIT_CODE"
log_info "  PR number: ${PR_NUMBER:-none}"
log_info "  PR URL: ${PR_URL:-none}"

# Send Telegram notification
if [ -f "$TELEGRAM_NOTIFY_SCRIPT" ]; then
    log_info "Sending Telegram notification to admins..."

    NOTIFY_ARGS=(
        "--issue-number" "$ISSUE_NUMBER"
        "--issue-url" "$ISSUE_URL"
        "--repo" "$GITHUB_OWNER/$GITHUB_REPO"
    )

    if [ $SOLVE_EXIT_CODE -eq 0 ]; then
        NOTIFY_ARGS+=("--success")

        # Add PR information if available
        if [ -n "$PR_NUMBER" ]; then
            NOTIFY_ARGS+=("--pr-number" "$PR_NUMBER")
        fi
        if [ -n "$PR_URL" ]; then
            NOTIFY_ARGS+=("--pr-url" "$PR_URL")
        fi
    else
        # Extract first 500 chars of error for notification
        ERROR_MSG=$(echo "$SOLVE_ERROR" | head -c 500)
        NOTIFY_ARGS+=("--error" "$ERROR_MSG")
    fi

    # Execute notification script
    if python3 "$TELEGRAM_NOTIFY_SCRIPT" "${NOTIFY_ARGS[@]}"; then
        log_info "Telegram notification sent successfully"
    else
        log_warn "Failed to send Telegram notification (exit code: $?)"
        log_warn "This does not affect the solve process"
    fi
else
    log_warn "Telegram notification script not found: $TELEGRAM_NOTIFY_SCRIPT"
    log_warn "Skipping notification"
fi

# Exit with the same code as /solve
log_info "Auto-solve wrapper completed"
exit $SOLVE_EXIT_CODE
