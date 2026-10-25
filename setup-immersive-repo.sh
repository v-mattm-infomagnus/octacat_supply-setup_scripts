#!/bin/sh
set -eu

# PARTICIPANT: Change only this URL to your new EMPTY GitHub repository (make sure url ends with '.git').
NEW_REPO_URL="<your-gh-repo-url>.git"

# ============================================================
# DO NOT MODIFY BELOW THIS LINE
# ============================================================

SOURCE_REPO_URL="https://github.com/copilot-academy/octocat_supply.git"

# Normalize GitHub URLs for comparison (with or without .git).
normalize_url() {
  url="${1%/}"
  url="${url%.git}"
  printf '%s' "$url"
}

SOURCE_COMPARE=$(normalize_url "$SOURCE_REPO_URL")
DEST_COMPARE=$(normalize_url "$NEW_REPO_URL")

# Validate the destination URL to prevent accidental pushes.
if [ "$NEW_REPO_URL" = "https://github.com/YOUR-ORG/YOUR-REPO.git" ] ||
   [ "$DEST_COMPARE" = "$SOURCE_COMPARE" ]; then
  echo "ERROR: Set NEW_REPO_URL to your own empty GitHub repository." >&2
  exit 1
fi

case "$NEW_REPO_URL" in
  https://github.com/*/*.git) ;;
  *)
    echo "ERROR: Enter a GitHub HTTPS repository URL ending in .git" >&2
    exit 1
    ;;
esac

# Run from the directory containing this script (repository root).
cd "$(dirname "$0")"

# ============================================================
# NODE.JS CONFIGURATION
# ============================================================

# Create .nvmrc to specify Node.js 24 for this project.
printf '24\n' > .nvmrc
echo "Created .nvmrc specifying Node.js 24."

# Check the active Node.js version.
NODE_VERSION=$(node -v 2>/dev/null || true)

case "$NODE_VERSION" in
  v24.*)
    echo "Node.js $NODE_VERSION detected. Ready."
    ;;
  *)
    echo ""
    echo "NOTICE: Node.js 24 is recommended for this workshop."
    echo "Current version: ${NODE_VERSION:-Not installed}"
    echo ""
    echo "If you use nvm (macOS, Linux, or Windows WSL), run:"
    echo "  nvm install"
    echo "  nvm use"
    echo ""
    echo "If you use nvm-windows, run:"
    echo "  nvm install 24"
    echo "  nvm use 24"
    echo ""
    echo "Run these commands in your terminal after setup."
    echo ""
    ;;
esac

# ============================================================
# GIT REPOSITORY CONFIGURATION
# ============================================================

CURRENT_ORIGIN=$(git remote get-url origin)
CURRENT_COMPARE=$(normalize_url "$CURRENT_ORIGIN")

if [ "$CURRENT_COMPARE" = "$SOURCE_COMPARE" ]; then

  # Fetch original repository branches.
  git fetch origin

  # Create local feature branches if they don't already exist.
  for branch in feature-add-tos-download feature-add-cart-page; do
    if ! git show-ref --verify --quiet "refs/heads/$branch"; then
      git branch --track "$branch" "origin/$branch"
    else
      echo "Branch '$branch' already exists. Skipping."
    fi
  done

  # Configure the destination remote, including recovery from a failed run.
  if git remote get-url workshop-destination >/dev/null 2>&1; then
    git remote set-url workshop-destination "$NEW_REPO_URL"
  else
    git remote add workshop-destination "$NEW_REPO_URL"
  fi

  PUSH_REMOTE="workshop-destination"

elif [ "$CURRENT_COMPARE" = "$DEST_COMPARE" ]; then

  echo "Origin already points to your new repository."
  PUSH_REMOTE="origin"

else

  echo "ERROR: Unexpected origin remote: $CURRENT_ORIGIN" >&2
  echo "Expected the Copilot Academy source or your new repository." >&2
  exit 1

fi

# Push all required workshop branches and establish upstream tracking.
# A failed push stops the script before removing the original remote.
git push -u "$PUSH_REMOTE" main feature-add-tos-download feature-add-cart-page

# Only disconnect from the source AFTER the push succeeds.
if [ "$PUSH_REMOTE" = "workshop-destination" ]; then
  git remote remove origin
  git remote rename workshop-destination origin
fi

# ============================================================
# FINAL VERIFICATION
# ============================================================

echo ""
echo "=== Repository Remotes ==="
git remote -v

echo ""
echo "=== Local Branch Tracking ==="
git branch -vv

echo ""
echo "=== Branches on Your New GitHub Repository ==="
git ls-remote --heads origin

echo ""
echo "=== Node.js Configuration ==="
echo ".nvmrc specifies Node.js 24."
echo "Active Node.js version: ${NODE_VERSION:-Not installed}"

echo ""
echo "SUCCESS: Workshop repository setup complete!"
echo ""
echo "NEXT STEPS:"
echo "1. Activate Node.js 24 if it is not already active."
echo "2. Run: make install"
echo "3. Run: make build"
echo "4. Run: make db-init"
echo ""
