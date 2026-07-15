# Japanese UI Demo — #318

This directory demonstrates how the Japanese-language UI support added in #318 is exercised end-to-end.
The previous demo recording (`streaming_retry_demo.mp4`) covers the Ollama retry flow; this directory
adds the equivalent screenshots and capture script for the i18n feature.

## How to capture the demo screenshots

```bash
# 1. Make sure dependencies are installed and the dev server is running.
cd frontend
npm ci
npm run dev   # frontend reachable at http://localhost:3000

# 2. (New in this PR): run the Japanese-UI screenshot capture.
npm run screenshot:japanese

# Output (PNG files written to ../demo_videos/):
#   1-japanese-settings-default-en.png     — Settings panel open, language still "English"
#   2-japanese-settings-selected.png       — Language dropdown switched to "日本語"
#   3-japanese-chat-after-save.png         — Chat UI re-rendered with new default language
#   4-sidebar-with-ja-option.png           — Sidebar showing the 日本語 option in the list
```

## What the screenshots show

1. **Settings panel** opens; the "Default Language" select shows the existing list of supported
   languages (the new `日本語` option is at the bottom, code `ja`).

2. **The dropdown selection** is switched to `日本語`, and the form value `default_language` flips
   from `en` → `ja`. The "Save" button persists this to the backend via `PUT /api/settings/`.

3. **The chat UI** re-renders on the next render of `<Sidebar>` and `<ChatWindow>` — the `setLanguage`
   callback in `App.jsx` propagates the new locale into `language` state, and downstream components
   pick up the new string templates. All UI strings that map through `t(...)` switch immediately.

4. **The sidebar's language list** was updated in `Sidebar.jsx` to include `{ code: "ja", label: "日本語" }`
   in the `LANGUAGES` constant, so the new option is also visible in the chat-session language picker.

## Why a script instead of a video

Capturing a screen-recording video requires either (a) running the full LocalMind stack
(`uvicorn app:app` + `vite dev`) while simultaneously recording with Playwright or OBS, or (b) producing
a hand-edited Walkthrough video that reviewers can replay.

For SSoC review purposes a screenshot-tour is more practical:
- Reviewers can re-run `npm run screenshot:japanese` themselves and confirm the i18n flow works on
  their machine without downloading a video.
- The screenshots are also committed in `demo_videos/` so anyone browsing the repo on GitHub can
  see the Japanese UI without running anything.

If the maintainer prefers an actual video walkthrough, the same capture flow can drive Playwright's
`page.video()` API to write a webm recording — happy to follow up with that variant.
