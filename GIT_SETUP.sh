#!/bin/bash
set -e

# This script sets up a git repo, connects it to GitHub, and commits the handoff files.
# Run from your project folder.

REPO_NAME="gamification-platform"
GITHUB_USERNAME="sumeet96"  # CHANGE THIS

echo "=== Git Setup for $REPO_NAME ==="
echo ""

# 1. Initialize git
if [ ! -d .git ]; then
    echo "1. Initializing git repository..."
    git init
    echo "✓ Git initialized"
else
    echo "✓ Git already initialized"
fi

# 2. Create .gitignore
echo ""
echo "2. Creating .gitignore..."
cat > .gitignore << 'GITIGNORE'
# Environment
.env
.env.local
.env*.local

# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# Build outputs
.next/
out/
build/
dist/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
.DS_Store

# Firebase
.firebase/
.firebaserc

# API keys & secrets
credentials.json
service-account-key.json
API_KEYS.txt

# Logs
logs/
*.log

# OS
Thumbs.db
.DS_Store
GITIGNORE
echo "✓ .gitignore created"

# 3. Create initial directory structure
echo ""
echo "3. Creating directory structure..."
mkdir -p docs/literature
mkdir -p src/{backend,frontend,ai-layer}
mkdir -p tests
mkdir -p config
echo "✓ Directories created"

# 4. Create README (placeholder)
echo ""
echo "4. Creating README.md..."
cat > README.md << 'README'
# AI-Personalized Gamification Platform

A gamified learning platform where an AI layer designs the gamification itself — quests, badges, point values — per student from their performance history, with a human-in-the-loop teacher approval layer.

**Status:** Development (started Jul 22 2026)  
**Supervisor:** Prof. Harshit Kumar Singh, XLRI  
**Timeline:** 6 months (pilot by mid-September 2026)

## Quick start

See `CLAUDE.md` for the operating brief and `HANDOFF.md` for the full project context.

```bash
# After cloning, install dependencies
npm install

# Start development
npm run dev
```

## Stack

- **Runtime:** Gemini paid Tier 1 (LLM), Supabase/Firebase (DB), Vercel (hosting)
- **Dev:** Claude Code (primary), v0 (frontend), Antigravity (overflow), DeepSeek (code review)
- **Knowledge:** Gamification for Dummies + course material

## Roadmap

See `HANDOFF.md` §6 for the full 3-month breakdown. Current focus: Week 1 — architecture doc + model justification.

## Files

- `CLAUDE.md` — working brief, operations manual
- `HANDOFF.md` — project history, literature, full spec
- `docs/literature/` — reference papers
- `src/` — application source

README
echo "✓ README.md created"

# 5. Stage and commit
echo ""
echo "5. Staging files..."
git add .
echo "✓ Files staged"

echo ""
echo "6. Creating initial commit..."
git config user.name "Sumeet Mohanty" 2>/dev/null || git config user.name "Developer"
git config user.email "you@example.com" 2>/dev/null || git config user.email "dev@example.com"
git commit -m "Initial commit: project structure, handoff docs, and operating files"
echo "✓ Initial commit created"

# 6. GitHub setup instructions
echo ""
echo "============================================================"
echo "✓ Local git setup complete!"
echo ""
echo "NEXT STEPS — Connect to GitHub:"
echo ""
echo "1. Go to https://github.com/new"
echo "2. Create a new repository named: $REPO_NAME"
echo "   - Description: 'AI-Personalized Gamification Platform'"
echo "   - Do NOT initialize with README, .gitignore, or license"
echo "   - Click 'Create repository'"
echo ""
echo "3. Copy the repo URL (HTTPS or SSH), then run:"
echo ""
echo "   git remote add origin https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "4. Verify:"
echo "   git remote -v"
echo ""
echo "============================================================"
