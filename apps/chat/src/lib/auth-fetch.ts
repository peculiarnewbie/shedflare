async function refreshSession() {
  const response = await fetch("/api/session", { credentials: "same-origin" });
  return response.ok;
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, { ...init, credentials: init?.credentials ?? "same-origin" });
  if (response.status !== 401) return response;

  if (!(await refreshSession())) return response;
  return fetch(input, { ...init, credentials: init?.credentials ?? "same-origin" });
}

export async function refreshAuthSession() {
  return refreshSession();
}
