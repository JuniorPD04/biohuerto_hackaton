const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToB64(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function b64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getDeviceSecret() {
  let secret = localStorage.getItem("biohuerto:device-secret");
  if (!secret) {
    secret = bytesToB64(crypto.getRandomValues(new Uint8Array(32)));
    localStorage.setItem("biohuerto:device-secret", secret);
  }
  return secret;
}

async function deviceKey(userId) {
  const material = encoder.encode(`${getDeviceSecret()}:${userId}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptJson(userId, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deviceKey(userId);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(value)));
  return JSON.stringify({ v: 1, iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(ciphertext)) });
}

export async function decryptJson(userId, value) {
  if (!value) return null;
  const envelope = JSON.parse(value);
  const key = await deviceKey(userId);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(envelope.iv) }, key, b64ToBytes(envelope.data)
  );
  return JSON.parse(decoder.decode(plain));
}

export function getDeviceId() {
  let id = localStorage.getItem("biohuerto:device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("biohuerto:device-id", id);
  }
  return id;
}
