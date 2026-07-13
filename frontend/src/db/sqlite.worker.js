import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import migration001 from "./migrations/001_local_first.sql?raw";

let sqlite3;
let db;
let persistent = false;

const safeName = (value) => String(value || "guest").replace(/[^a-zA-Z0-9_-]/g, "_");

async function openDb(userId) {
  sqlite3 ||= await sqlite3InitModule({ print: () => {}, printErr: console.error });
  db?.close();
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({
      name: "biohuerto-opfs",
      directory: ".biohuerto",
      initialCapacity: 8,
    });
    db = new pool.OpfsSAHPoolDb(`/biohuerto-${safeName(userId)}.sqlite3`);
    persistent = true;
  } catch (error) {
    console.warn("SQLite OPFS no disponible; se usa una base temporal", error);
    db = new sqlite3.oo1.DB(":memory:", "ct");
    persistent = false;
  }
  db.exec(migration001);
  return { persistent, version: sqlite3.version.libVersion, filename: db.filename };
}

function execute({ sql, bind = [] }) {
  if (!db) throw new Error("SQLite no inicializado");
  db.exec({ sql, bind });
  return { changes: Number(db.changes(true)) };
}

function query({ sql, bind = [] }) {
  if (!db) throw new Error("SQLite no inicializado");
  return db.exec({ sql, bind, rowMode: "object", returnValue: "resultRows" });
}

self.onmessage = async ({ data }) => {
  const { id, action, payload } = data;
  try {
    let result;
    if (action === "open") result = await openDb(payload.userId);
    else if (action === "execute") result = execute(payload);
    else if (action === "query") result = query(payload);
    else if (action === "close") { db?.close(); db = null; result = true; }
    else throw new Error(`Accion SQLite desconocida: ${action}`);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};
