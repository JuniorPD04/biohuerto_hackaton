import { expect, test } from "@playwright/test";

test("publica manifiesto y service worker", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
  expect((await request.get("/manifest.webmanifest")).ok()).toBeTruthy();
  expect((await request.get("/sw.js")).ok()).toBeTruthy();
});

test("la pantalla de acceso no desborda en movil", async ({ page }) => {
  await page.goto("/login");
  const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
  await expect(page.getByRole("button", { name: "Ingresar" })).toBeVisible();
});

test("el shell vuelve a cargar sin red despues de instalarse", async ({ page, context }) => {
  await page.goto("/login");
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Ingresar" })).toBeVisible();
  await context.setOffline(false);
});

test("el superadministrador puede preparar un envio individual en movil", async ({ page }) => {
  const user = {
    id: 1,
    email: "admin@biohuerto.pe",
    nombre: "Administracion Biohuerto",
    rol: "admin",
    is_active: true,
    created_at: "2026-06-01T12:00:00Z",
    updated_at: "2026-06-01T12:00:00Z",
  };
  await page.addInitScript(() => localStorage.setItem("biohuerto:notification-nudge:1", "dismissed"));
  await page.route("**/auth/refresh", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ access_token: "test-token", token_type: "bearer", expires_in_seconds: 900, user }),
  }));
  await page.route("**/api/acceso/me", (route) => route.fulfill({ json: { rol: "admin", permisos: {} } }));
  await page.route("**/api/sync/bootstrap", (route) => route.fulfill({ json: { cursor: 0, entities: {}, catalogs: {}, permissions: {} } }));
  await page.route("**/api/sync", (route) => route.fulfill({ json: { results: [], changes: [], next_cursor: 0, has_more: false } }));
  await page.route("**/api/notifications/admin/**", (route) => {
    const { pathname } = new URL(route.request().url());
    let status = 200;
    let body = [];
    if (pathname.endsWith("/recipients")) {
      body = [
        { id: 7, nombre: "Rosa Campos", email: "rosa@biohuerto.pe", rol: "productor", has_subscription: true },
        { id: 8, nombre: "Luis Quispe", email: "luis@biohuerto.pe", rol: "consumidor", has_subscription: false },
      ];
    } else if (route.request().method() === "POST") {
      status = 201;
      body = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "queued", recipient_count: 1, subscribed_recipient_count: 1, image_url: null };
    }
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/notificaciones");
  await expect(page.getByRole("heading", { name: "Centro de notificaciones" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Un usuario/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Rosa Campos/ }).click();
  await page.getByLabel("Titulo").fill("Taller de compostaje");
  await page.getByLabel("Mensaje").fill("Te esperamos este sabado a las nueve.");
  await page.getByRole("button", { name: "Enviar notificacion" }).click();
  await expect(page.getByRole("heading", { name: "La notificacion esta en cola" })).toBeVisible();
  const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
});
