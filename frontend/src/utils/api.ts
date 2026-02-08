// No authentication - just pass through fetch calls

export async function getAccessToken(): Promise<string | null> {
  return null;
}

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, init);
}
