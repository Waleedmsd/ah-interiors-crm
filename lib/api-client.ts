export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** One error boundary for JSON APIs. Never render a proxy's HTML error page. */
export async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(url, { ...init, credentials: 'same-origin', headers });
  } catch (error) {
    // Preserve cancellation: callers must not report an intentional abort as failure.
    if (init.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'The server could not be reached. Check your connection before trying again.');
  }

  if (response.status === 204) return undefined as T;
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      response.ok ? 'INVALID_RESPONSE' : 'REQUEST_FAILED',
      response.ok
        ? 'The server returned an unreadable response. Refresh the record before trying again.'
        : 'The server could not complete this request. Refresh the record before trying again.',
    );
  }

  if (!response.ok) {
    const failure = result && typeof result === 'object' && 'error' in result
      ? (result as { error?: unknown }).error : undefined;
    const detail = failure && typeof failure === 'object'
      ? failure as { code?: unknown; message?: unknown } : undefined;
    const code = typeof detail?.code === 'string' ? detail.code : 'REQUEST_FAILED';
    const message = typeof detail?.message === 'string' && detail.message.trim()
      ? detail.message : 'The request could not be completed.';
    throw new ApiError(response.status, code, message);
  }
  return result as T;
}
