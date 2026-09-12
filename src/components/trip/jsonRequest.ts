type JsonPostMessages = {
  network: string;
  unreadable: string;
  status: (status: number) => string;
};

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function postJson(
  url: string,
  payload: unknown,
  messages: JsonPostMessages,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<{ response: Response; body: unknown }> {
  let response: Response;

  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error(messages.network, { cause: error });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (!response.ok) throw new Error(messages.status(response.status), { cause: error });
    throw new Error(messages.unreadable, { cause: error });
  }

  return { response, body };
}
