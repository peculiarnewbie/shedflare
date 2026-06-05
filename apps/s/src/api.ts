export type LinkRow = {
  slug: string;
  url: string;
  createdAt: string;
};

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function fetchLinks(): Promise<{ links: LinkRow[] }> {
  return apiFetch("/api/links");
}

export function createLink(slug: string, url: string): Promise<LinkRow | { error: string }> {
  return apiFetch("/api/links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug, url }),
  });
}

export function deleteLink(slug: string): Promise<void> {
  return apiFetch(`/api/links/${encodeURIComponent(slug)}`, { method: "DELETE" });
}
