import { beforeEach, describe, expect, it } from "vitest";
import { decryptJson, encryptJson, getDeviceId } from "./crypto.js";

describe("cifrado local", () => {
  beforeEach(() => localStorage.clear());

  it("cifra y recupera un payload por usuario", async () => {
    const payload = { id: "abc", observacion: "riego temprano" };
    const encrypted = await encryptJson("42", payload);
    expect(encrypted).not.toContain("riego temprano");
    await expect(decryptJson("42", encrypted)).resolves.toEqual(payload);
  });

  it("mantiene un identificador estable por dispositivo", () => {
    expect(getDeviceId()).toBe(getDeviceId());
  });
});
