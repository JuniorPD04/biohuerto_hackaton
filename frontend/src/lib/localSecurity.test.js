import { beforeEach, describe, expect, it } from "vitest";
import { disableLocalSecurity, getLocalSecurity, setLocalPin, verifyLocalPin } from "./localSecurity.js";

describe("bloqueo local", () => {
  beforeEach(() => localStorage.clear());

  it("configura y valida un PIN sin guardarlo en texto plano", async () => {
    await setLocalPin("7", "2468");
    expect(JSON.stringify(getLocalSecurity("7"))).not.toContain("2468");
    await expect(verifyLocalPin("7", "2468")).resolves.toBe(true);
    await expect(verifyLocalPin("7", "1111")).resolves.toBe(false);
  });

  it("permite desactivar el bloqueo", () => {
    disableLocalSecurity("7");
    expect(getLocalSecurity("7").mode).toBe("none");
  });
});
