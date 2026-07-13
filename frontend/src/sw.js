/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/"),
  new NetworkOnly()
);

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || "Biohuerto Inteligente", {
    body: data.body || "Tienes una novedad en tu biohuerto.",
    icon: "/pwa/icon-192.png",
    badge: "/pwa/icon-192.png",
    image: data.image || undefined,
    tag: data.tag || "biohuerto",
    data: { url: data.url || "/alertas" },
    renotify: Boolean(data.renotify),
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    for (const client of windows) {
      if ("navigate" in client) await client.navigate(target);
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow(target);
  }));
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "biohuerto-sync") return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => client.postMessage({ type: "BIOHUERTO_SYNC_REQUEST" }));
  }));
});
