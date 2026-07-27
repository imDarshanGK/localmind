# Automated Screenshot Capture

LocalMind includes an automated screenshot capture tool designed to generate clean and consistent screenshots of key UI states for documentation, pull requests, and visual testing.

The tool uses **Playwright** to launch a headless browser, navigate the application interface, interact with control panels, and capture screenshots of key application states.

## Prerequisites

Before running the screenshot capture tool, ensure:
1. The **Backend** FastAPI server is running (typically on port 8000).
2. The **Frontend** Vite dev server is running (typically on port 3000).
3. You have installed the required dependencies and browser binaries.

## Installation

Run the following commands inside the `frontend/` directory to install Playwright and the browser binary:

```bash
cd frontend
npm install
npx playwright install chromium
```

## Running the Capture Tool

To execute the screenshot capture:

```bash
cd frontend
npm run screenshot
```

By default, the script connects to the local application at `http://localhost:3000`. If your frontend is running on a different port or host, specify it using the `APP_URL` environment variable:

**Windows (PowerShell):**
```powershell
$env:APP_URL="http://localhost:3000"; npm run screenshot
```

**macOS / Linux:**
```bash
APP_URL=http://localhost:3000 npm run screenshot
```

## Captured States

The captured screenshots are saved in the `screenshots/` directory at the root of the repository:

- `1-main-chat.png` - The default landing state showing the chat interface.
- `2-docs-panel.png` - The open Documents (Upload) panel.
- `3-plugins-panel.png` - The open Plugins selection panel.
- `4-settings-panel.png` - The open Settings configuration panel.
