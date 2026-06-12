# Stream Cancellation

This document explains the stream cancellation mechanism implemented in LocalMind.

## How Stream Cancellation Works

The stream cancellation mechanism allows users to abruptly stop a long-running LLM generation. It handles everything from the UI state to the backend HTTP streams, ensuring that resources are preserved and intermediate generated text is not lost.

1. **Frontend Request (AbortController):** When a user starts a stream, the application creates a standard `AbortController` and passes its `signal` into the `fetch` API request.
2. **User Triggers Cancel:** If the user presses the "Stop ⏹" button, the frontend calls `abortController.abort()`. This instantly terminates the HTTP connection to the backend.
3. **Backend Detection:** The backend framework (FastAPI/Starlette) detects the closed connection and raises an `asyncio.CancelledError` inside the generator function responsible for streaming Server-Sent Events (SSE) back to the client.
4. **LLM Engine Cleanup:** Because the backend relies on an `async with httpx.AsyncClient().stream(...)` context manager for interacting with Ollama, the cancellation event bubbles down and closes the Ollama connection as well. Ollama immediately ceases generating further tokens, freeing up local GPU/CPU resources.
5. **Partial Content Preservation:** The backend catches the `asyncio.CancelledError`, extracts whatever tokens were yielded before the cancellation, and saves the incomplete response to the local database, appending a `[Cancelled]` tag.

## Expected Behavior After Cancellation

* **UI Updates:** The "Stop ⏹" button instantly vanishes, replaced by the "Send →" button. The message history displays the partially generated text ending with `[Cancelled]`.
* **Backend:** You should see no unhandled exceptions in the server logs. The backend silently saves the partial record.
* **Ollama Server:** The inference stops.

## Limitations

* **Ollama Latency:** While the HTTP connection is closed immediately, Ollama might still process a few tokens in its internal buffers before it recognizes the dropped connection. These tokens are discarded and won't be saved or sent.
* **Frontend Chunk Rendering:** Due to React state updates, it's possible a fraction of a millisecond's worth of text is received by the frontend but not yet rendered when `abort()` is triggered. The final text saved in the backend database serves as the ultimate source of truth upon page refresh.
