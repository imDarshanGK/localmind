# Retry Policy for Model Errors

LocalMind implements a robust retry mechanism to automatically recover from transient network errors and rate-limiting responses when communicating with the local Ollama service.

## Trigger Conditions

The retry policy specifically intercepts and automatically retries requests when encountering:
- **Connection Errors:** `httpx.ConnectError`, `httpx.TimeoutException`, `httpx.ReadError`
- **Rate-Limiting & Server Overload:** HTTP `429 Too Many Requests`, `503 Service Unavailable`, `502 Bad Gateway`, `504 Gateway Timeout`, `408 Request Timeout`

Non-transient errors (like HTTP `400 Bad Request` or `404 Not Found`) are **not** retried and fail immediately, preventing unnecessary waiting.

## Exponential Backoff Strategy

We use a standard exponential backoff configuration to prevent overwhelming an already stressed Ollama backend:
- **Max Attempts:** 3 (1 initial + 2 retries)
- **Initial Backoff:** 1.0 second
- **Multiplier:** 2x

*Timeline of attempts:*
1. Attempt 1: Fails
2. *Wait 1.0s*
3. Attempt 2: Fails
4. *Wait 2.0s*
5. Attempt 3: Success!

If Attempt 3 fails, the backend bubbles up the exact error so the user UI can handle the failure naturally (e.g. "Ollama not running").

## Streaming vs Non-Streaming endpoints

- **Non-Streaming (`chat`, `list_models`, `delete_model`)**: The entire HTTP request lifecycle is wrapped in the `@with_retry` decorator.
- **Streaming (`chat_stream`, `pull_model`)**: Streaming endpoints yield partial chunks sequentially. Because we cannot safely "rewind" a partial response mid-stream without duplicating text on the UI, the retry policy strictly applies only to the **initial connection phase**. If the stream drops midway, it safely aborts.
