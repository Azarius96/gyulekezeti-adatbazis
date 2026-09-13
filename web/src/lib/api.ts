// Fejlesztésben a Vite dev-szerver külön porton fut, mint a backend, ezért ott a teljes
// URL-t meg kell adni. Éles buildben a Fastify szerver szolgálja ki magát a lebuildelt
// frontendet is ugyanarról az originről - ott az üres string (relatív útvonal) a helyes,
// hogy ne kelljen tudni előre a nyilvános domaint build-időben.
export const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.PROD ? "" : "http://localhost:4000");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = "Hiba történt";
    try {
      const body = await res.json();
      message = body.error?.toString?.() ?? message;
    } catch {
      // ignore
    }
    throw new ApiError(typeof message === "string" ? message : "Hiba történt", res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
};
