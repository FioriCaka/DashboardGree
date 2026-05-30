const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export function getToken() {
  return localStorage.getItem("gree_token");
}

export function setSession(session) {
  localStorage.setItem("gree_token", session.token);
  localStorage.setItem("gree_user", JSON.stringify(session.user));
}

export function clearSession() {
  localStorage.removeItem("gree_token");
  localStorage.removeItem("gree_user");
}

export function getStoredUser() {
  const raw = localStorage.getItem("gree_user");
  return raw ? JSON.parse(raw) : null;
}

export async function api(path, options = {}) {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Array.isArray(data.details)
      ? `: ${data.details.map((issue) => `${issue.path?.join(".")}: ${issue.message}`).join(", ")}`
      : "";
    throw new Error(`${data.message ?? "Request failed"}${details}`);
  }
  return data;
}

export const authApi = {
  login: (payload) =>
    api("/login", { method: "POST", body: JSON.stringify(payload) }),
  register: (payload) =>
    api("/register", { method: "POST", body: JSON.stringify(payload) }),
  profile: () => api("/profile"),
  updateProfile: (payload) =>
    api("/profile", { method: "PUT", body: JSON.stringify(payload) }),
  changePassword: (payload) =>
    api("/profile/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const resourceApi = {
  list: (resource, params = {}) =>
    api(`/${resource}?${new URLSearchParams(params)}`),
  show: (resource, id) => api(`/${resource}/${id}`),
  create: (resource, payload) =>
    api(`/${resource}`, { method: "POST", body: JSON.stringify(payload) }),
  update: (resource, id, payload) =>
    api(`/${resource}/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  remove: (resource, id) => api(`/${resource}/${id}`, { method: "DELETE" }),
  restore: (resource, id) =>
    api(`/${resource}/${id}/restore`, { method: "POST" }),
  lookups: () => api("/lookups"),
};
