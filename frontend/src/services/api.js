export const config = window.SHIFTSYNC || {
  basePath: "",
  csrf: "",
  user: null,
};
export const path = (target) => `${config.basePath}${target}`;

export class ApiError extends Error {
  constructor(message, code = "NETWORK", fields = {}, status = 0) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.fields = fields || {};
    this.status = status;
  }
}

export async function api(
  action,
  { params = {}, body, signal, refreshCsrf = true, background = false } = {},
) {
  const query = new URLSearchParams({ action, ...params });
  let response;
  try {
    response = await fetch(path(`/api/index.php?${query}`), {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers:
        body === undefined
          ? {
              Accept: "application/json",
              ...(background ? { "X-Background-Refresh": "1" } : {}),
            }
          : {
              Accept: "application/json",
              "Content-Type": "application/json",
              "X-CSRF-Token": config.csrf,
            },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    // Ambiguous mutations are never replayed automatically.
    throw new ApiError(
      "The server could not be reached. Refresh to check the saved result before trying again.",
    );
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      "The server returned an unreadable response. Check your connection and refresh.",
      "RESPONSE",
      {},
      response.status,
    );
  }
  if (!response.ok || !payload.ok) {
    const error = payload.error || {};
    // Only this explicit rejection guarantees the command never ran.
    if (body !== undefined && refreshCsrf && error.code === "csrf_rejected") {
      const token = await api("session", { signal, refreshCsrf: false });
      config.csrf = token.data.csrf;
      return api(action, { params, body, signal, refreshCsrf: false });
    }
    if (response.status === 401)
      window.dispatchEvent(new CustomEvent("shiftsync:session-expired"));
    throw new ApiError(
      error.message || "The action could not be completed.",
      error.code,
      error.fields,
      response.status,
    );
  }
  return payload;
}
