const extensionByMimeType: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "image/jpeg": ".jpg",
  "image/png": ".png"
};

/**
 * The live employee_documents table stores a title and MIME type, not the
 * original client filename, description, or uploaded_at. Keep the existing
 * frontend response contract without pretending those absent values exist:
 * originalName is a generated download filename based on title + MIME type,
 * description is explicitly null, and uploadedAt aliases created_at.
 */
export function toDocumentView<T extends { title: string; mimeType: string; createdAt: Date }>(document: T) {
  const extension = extensionByMimeType[document.mimeType] ?? "";
  const safeTitle = document.title.replaceAll("/", "-").replaceAll("\\\\", "-").replace(/[\\u0000-\\u001f]/g, "-").trim().slice(0, 120) || "employee-document";
  return {
    ...document,
    originalName: `${safeTitle}${extension}`,
    description: null,
    uploadedAt: document.createdAt
  };
}
