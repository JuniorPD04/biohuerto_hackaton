const worker = new Worker(new URL("./sqlite.worker.js", import.meta.url), { type: "module" });
const pending = new Map();
let sequence = 0;
let activeUser = null;
let openInfo = null;

worker.onmessage = ({ data }) => {
  const request = pending.get(data.id);
  if (!request) return;
  pending.delete(data.id);
  if (data.error) request.reject(new Error(data.error));
  else request.resolve(data.result);
};

function call(action, payload = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, action, payload });
  });
}

export async function openLocalDb(userId) {
  if (activeUser === String(userId) && openInfo) return openInfo;
  activeUser = String(userId);
  openInfo = await call("open", { userId: activeUser });
  return openInfo;
}

export const dbExecute = (sql, bind = []) => call("execute", { sql, bind });
export const dbQuery = (sql, bind = []) => call("query", { sql, bind });
export const closeLocalDb = () => call("close");

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function storageEstimate() {
  return navigator.storage?.estimate ? navigator.storage.estimate() : null;
}
