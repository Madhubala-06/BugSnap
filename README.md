# BugSnap

Stop writing bug reports manually. Record your screen, and let AI do the rest.

## What is BugSnap?

BugSnap is an AI-powered bug reporting tool that automates the entire bug documentation process:

1. **Record** - Use the Chrome extension to capture your screen while reproducing a bug
2. **Capture** - Screenshots and console logs are automatically captured during recording
3. **Analyze** - AI analyzes the recording and generates a detailed bug report
4. **Report** - Get a complete bug ticket with title, description, severity, and steps to reproduce

No more vague bug descriptions. No more back-and-forth asking "how do I reproduce this?"

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Chrome         │     │  Backend API    │     │  Web Dashboard  │
│  Extension      │────▶│  + AI Analysis  │────▶│  View & Edit    │
│  (Record Bug)   │     │  (Process)      │     │  (Manage)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 1. Chrome Extension
- One-click screen recording
- Captures video, screenshots, and browser console logs
- Tracks user clicks and navigation

### 2. AI Analysis
- Analyzes screenshots to understand the bug
- Generates bug title and description
- Suggests severity level (low/medium/high/critical)
- Creates steps to reproduce
- Identifies potential root cause

### 3. Web Dashboard
- View all bug reports
- Edit and annotate screenshots
- Rich text editor for adding details
- Export or share with your team

## Project Structure

```
├── apps/
│   ├── api/          # Backend API (NestJS + Prisma)
│   ├── extension/    # Chrome extension (Plasmo + React)
│   └── web/          # Dashboard (Next.js 15)
└── packages/
    └── shared/       # Shared types and utilities
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Monorepo | Turborepo |
| Package Manager | pnpm |
| Language | TypeScript |
| Backend | NestJS, Prisma, PostgreSQL |
| Extension | Plasmo, React, Tailwind CSS |
| Dashboard | Next.js 15, TipTap Editor, Fabric.js |

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm 9.15.0+
- PostgreSQL database

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env
# Edit .env with your database URL and OpenAI API key

# Run database migrations
pnpm --filter @bugsnap/api prisma migrate dev

# Start all apps
pnpm dev
```

### Development

```bash
# Run all apps
pnpm dev

# Run specific app
pnpm --filter @bugsnap/api dev      # API on http://localhost:3001
pnpm --filter @bugsnap/web dev      # Dashboard on http://localhost:3002
pnpm --filter @bugsnap/extension dev # Extension (load unpacked from build/)
```

### Load the Chrome Extension

1. Run `pnpm --filter @bugsnap/extension dev`
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select `apps/extension/build/chrome-mv3-dev`

## Usage

1. Click the BugSnap extension icon in Chrome
2. Click "Start Recording"
3. Reproduce the bug on your screen
4. Click "Stop Recording"
5. AI analyzes and creates a bug report
6. View and edit the report in the dashboard

## License

Private
