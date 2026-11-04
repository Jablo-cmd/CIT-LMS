import { describe, expect, it } from "vitest";
import { toDocumentView } from "./document-view.js";

describe("document compatibility view", () => {
  it("derives a download filename from the stored title and MIME type", () => {
    const createdAt = new Date("2026-10-31T12:30:00.000Z");
    const result = toDocumentView({
      id: "doc-1",
      title: "Employment contract",
      mimeType: "application/pdf",
      createdAt
    });

    expect(result.originalName).toBe("Employment contract.pdf");
    expect(result.uploadedAt).toBe(createdAt);
    expect(result.description).toBeNull();
  });

  it("sanitizes path separators and control characters in download filenames", () => {
    const result = toDocumentView({
      title: "../private/" + String.fromCharCode(0) + "record",
      mimeType: "image/png",
      createdAt: new Date("2026-10-31T12:30:00.000Z")
    });

    expect(result.originalName).toBe("..-private-record.png");
    expect(result.originalName).not.toContain("/");
  });
});
