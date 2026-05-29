const baseUrl = process.env.API_URL ?? "http://localhost:4000/api";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${body.message ?? ""} ${JSON.stringify(body.details ?? "")}`);
  }
  return body;
}

async function main() {
  const login = await request("/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@example.com", password: "asdasdasd" }),
  });
  const headers = { Authorization: `Bearer ${login.token}` };
  console.log(`login ok: ${login.user.email}`);

  const lookups = await request("/lookups", { headers });
  console.log(`lookups ok: products=${lookups.products.length}, users=${lookups.users.length}`);

  for (const resource of ["products", "clients", "users", "sales", "tasks", "inspections", "tickets", "complaints", "news", "reports"]) {
    const result = await request(`/${resource}?per_page=1`, { headers });
    console.log(`${resource} list ok: total=${result.meta?.total ?? result.data?.length ?? 0}`);
  }

  if (lookups.products.length) {
    const ticket = await request("/tickets", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "API Smoke Ticket",
        description: "Created by smoke test",
        productId: lookups.products[0].id,
        status: "new",
      }),
    });
    console.log(`tickets create ok: id=${ticket.data.id}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
