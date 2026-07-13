import { cacheRows, markLocalDeleted, queueOperation, readRows } from "./offlineStore.js";

const isNetworkError = (error) => !error?.response;

export async function localFirstList(entity, request, params = {}) {
  try {
    const data = await request();
    const rows = Array.isArray(data) ? data : data?.items || [];
    await cacheRows(entity, rows);
    return data;
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    return readRows(entity, params);
  }
}

export async function localFirstCreate(entity, body, request) {
  try {
    const data = await request();
    await cacheRows(entity, [data]);
    window.dispatchEvent(new CustomEvent("biohuerto:server-write"));
    return data;
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    return queueOperation(entity, "create", body);
  }
}

export async function localFirstUpdate(entity, id, body, request) {
  try {
    const data = await request();
    await cacheRows(entity, [data]);
    window.dispatchEvent(new CustomEvent("biohuerto:server-write"));
    return data;
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    return queueOperation(entity, "update", body, id);
  }
}

export async function localFirstDelete(entity, id, request) {
  try {
    const response = await request();
    await markLocalDeleted(entity, id);
    window.dispatchEvent(new CustomEvent("biohuerto:server-write"));
    return response;
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    await queueOperation(entity, "delete", {}, id);
    return null;
  }
}
