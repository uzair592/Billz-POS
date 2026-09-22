const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

function errorMessage(payload: { message?: unknown; error?: unknown }) {
  if (Array.isArray(payload.message)) return payload.message.join(" ");
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  return "The request could not be completed.";
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  platform = false,
): Promise<T> {
  const csrf =
    typeof window === "undefined"
      ? null
      : sessionStorage.getItem(platform ? "platform_csrf" : "csrf");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      errorMessage(payload),
      response.status,
      payload.code,
      payload.fields,
    );
  return payload as T;
}

export function saveCsrf(value: string, platform = false) {
  sessionStorage.setItem(platform ? "platform_csrf" : "csrf", value);
}
