const encoder = new TextEncoder();

function b64(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromB64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const keyFor = (userId) => `biohuerto:security:${userId}`;

export function getLocalSecurity(userId) {
  try { return JSON.parse(localStorage.getItem(keyFor(userId))) || { mode: "none" }; }
  catch { return { mode: "none" }; }
}

export async function setLocalPin(userId, pin) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error("El PIN debe tener entre 4 y 8 digitos.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const verifier = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, material, 256);
  localStorage.setItem(keyFor(userId), JSON.stringify({ mode: "pin", salt: b64(salt), verifier: b64(new Uint8Array(verifier)) }));
}

export async function verifyLocalPin(userId, pin) {
  const config = getLocalSecurity(userId);
  if (config.mode !== "pin") return true;
  const material = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromB64(config.salt), iterations: 150000, hash: "SHA-256" }, material, 256);
  return b64(new Uint8Array(result)) === config.verifier;
}

export async function enableBiometric(userId, userName) {
  if (!window.PublicKeyCredential || !navigator.credentials) throw new Error("La biometria no esta disponible en este dispositivo.");
  const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.();
  if (!available) throw new Error("No se encontro un autenticador biometrico compatible.");
  const credential = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: "Biohuerto Inteligente" },
    user: { id: encoder.encode(String(userId)), name: String(userName || userId), displayName: String(userName || "Usuario") },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
    timeout: 60000,
    attestation: "none",
  }});
  localStorage.setItem(keyFor(userId), JSON.stringify({ mode: "biometric", credentialId: b64(new Uint8Array(credential.rawId)) }));
}

export async function verifyBiometric(userId) {
  const config = getLocalSecurity(userId);
  if (config.mode !== "biometric") return true;
  const credential = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type: "public-key", id: fromB64(config.credentialId) }],
    userVerification: "required",
    timeout: 60000,
  }});
  return Boolean(credential && b64(new Uint8Array(credential.rawId)) === config.credentialId);
}

export function disableLocalSecurity(userId) {
  localStorage.setItem(keyFor(userId), JSON.stringify({ mode: "none" }));
}
