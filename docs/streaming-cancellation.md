# Streaming Cancellation

LocalMind supports reliable cancellation of long-running LLM stream generations. This document explains how stream cancellation works, expected behavior, and limitations.

## How it works

1. **Frontend Request**: When the user clicks the "Stop" button during an active generation in the UI, the frontend does two things:
   - Aborts the active fetch connection using the standard `AbortController` API. This instantly stops processing incoming Server-Sent Events (SSE) and updates the UI state.
   - Sends a secondary `POST /api/chat/cancel/{session_id}` request to the backend to signal that the stream was intentionally cancelled by the user.

2. **Backend Handling**: 
   - The backend sets a `cancelled` flag on the `StreamBuffer` associated with the active session.
   - The active `background_generator` task constantly polling the Ollama streaming API detects this flag and immediately `break`s the loop.
   - Breaking the loop properly closes the underlying `httpx` async stream, signaling Ollama to stop further token generation, effectively preventing unnecessary backend work and saving GPU/CPU resources.
   - A `[Generation Stopped]` indicator is appended to the accumulated text, and the partial response is safely committed to the SQLite database so no generated text is lost.

## Expected Behavior

- **UI Updates**: The generation immediately halts, the loading indicators stop, and `[Generation Stopped]` is appended to the message. The user can immediately type a new prompt or navigate away.
- **Data Preservation**: The partial text generated before the cancellation is preserved and securely saved in the database. When you refresh the chat or reload the app, the partially generated text is restored perfectly.
- **Cleanup**: Backend listeners are discarded, background generators exit cleanly, and Ollama clears the inference task.

## Limitations

- Due to async IO polling windows, 1-2 additional tokens might be fetched from Ollama after the cancellation signal is dispatched but before the generator breaks the loop. This delay is negligible and generally imperceptible.
- If the frontend drops the connection involuntarily (e.g. network failure) without calling the `/cancel/{session_id}` endpoint, the backend generator will continue to run to completion. This is by design, as it supports "Streaming Recovery", allowing the client to reconnect and resume reading the stream.
