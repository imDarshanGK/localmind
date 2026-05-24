# Root Cause Analysis - Japanese Language Support (Issue #80)

## Mechanical Chain (Mechanický řetězec)

1. **User selects "日本語" in UI** -> Frontend sets `default_language = "ja"` in settings.
2. **Chat request sent** -> Backend receives `language="ja"` parameter.
3. **System Prompt Selection** -> `ollama_service.py` looks up `SYSTEM_PROMPTS.get("ja", ...)`.
4. **Problem (Before Fix)**: Key "ja" did NOT exist in `SYSTEM_PROMPTS`. Backend fell back to English prompt (`SYSTEM_PROMPTS["en"]`).
5. **LLM Response**: Because the system prompt was in English, the LLM generated English responses even when the user selected Japanese.
6. **Solution (This PR)**: Added `"ja": "..."` to `SYSTEM_PROMPTS`.
7. **Result**: Backend now sends a Japanese system prompt. LLM responds in Japanese.

## Why `unstructured==0.10.30`?
The original `requirements.txt` specified `unstructured==0.15.0`, which does not exist on PyPI. Installation failed with "Could not find a version". Changed to `0.10.30` (verified available) to allow `pip install -r requirements.txt` to succeed for testing.

## Why add German/Spanish to Frontend?
The backend already had `"de"` and `"es"` prompts (added in prior commits), but the frontend `LANGUAGES` array was missing these codes. Users couldn't select them. This PR completes the frontend-backend consistency.