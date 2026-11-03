import { describe, expect, it, vi } from "vitest";
import { persistPrivateObject } from "./document-persistence.js";

describe("persistPrivateObject", () => {
  it("rolls back metadata and removes the new object when commit fails", async () => {
    const calls: string[] = [];
    const failure = new Error("audit write failed");

    await expect(persistPrivateObject({
      save: async () => { calls.push("save"); },
      commit: async () => { calls.push("commit"); throw failure; },
      rollback: async () => { calls.push("rollback"); },
      removeNew: async () => { calls.push("remove-new"); }
    })).rejects.toBe(failure);

    expect(calls).toEqual(["save", "commit", "rollback", "remove-new"]);
  });

  it("does not remove the previous object until the new object and metadata commit", async () => {
    const calls: string[] = [];

    const result = await persistPrivateObject({
      save: async () => { calls.push("save-new"); },
      commit: async () => { calls.push("commit-metadata-and-audit"); return "new-photo"; },
      rollback: async () => { calls.push("rollback"); },
      removeNew: async () => { calls.push("remove-new"); },
      removePrevious: async () => { calls.push("remove-previous"); }
    });

    expect(result).toBe("new-photo");
    expect(calls).toEqual(["save-new", "commit-metadata-and-audit", "remove-previous"]);
  });

  it("removes a partially saved new object if saving fails", async () => {
    const calls: string[] = [];

    await expect(persistPrivateObject({
      save: async () => { calls.push("save"); throw new Error("storage response lost"); },
      commit: async () => { calls.push("commit"); },
      rollback: async () => { calls.push("rollback"); },
      removeNew: async () => { calls.push("remove-new"); }
    })).rejects.toThrow("storage response lost");

    expect(calls).toEqual(["save", "rollback", "remove-new"]);
  });

  it("keeps the successful replacement when old-object cleanup fails", async () => {
    const removePrevious = vi.fn(async () => { throw new Error("old object unavailable"); });

    await expect(persistPrivateObject({
      save: async () => undefined,
      commit: async () => "replacement",
      rollback: async () => undefined,
      removeNew: async () => undefined,
      removePrevious
    })).resolves.toBe("replacement");
    expect(removePrevious).toHaveBeenCalledOnce();
  });
});