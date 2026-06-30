import { api } from "./api.js";
import { getDeviceId } from "../db/crypto.js";

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

export async function enableNotifications() {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Este navegador no admite notificaciones push.");
  }
  if (isIos() && !isStandalone()) {
    throw new Error("En iPhone, agrega primero Biohuerto a la pantalla de inicio.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { permission };
  const registration = await navigator.serviceWorker.ready;
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) return { permission, localOnly: true };
  let subscription = await registration.pushManager.getSubscription();
  subscription ||= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await api.post("/api/notifications/subscriptions", {
    device_id: getDeviceId(),
    subscription: subscription.toJSON(),
    user_agent: navigator.userAgent,
  });
  return { permission, subscription };
}

export async function disableNotifications() {
  const registration = await navigator.serviceWorker?.ready;
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
  await api.delete(`/api/notifications/subscriptions/${getDeviceId()}`);
}
