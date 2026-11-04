const extensionByMimeType: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "image/jpeg": ".jpg",
  "image/png": ".png"
};

/**
 * employee_documents stores a title and MIME type, not the original client
 * filename, description, or uploaded_at. The compatibility response exposes
 * a generated download filename, a null description, and created_at as
 * uploadedAt; it does not claim to recover the original client filename.
 */
export function toDocumentView<T extends { title: string; mimeType: string; createdAt: Date }>(document: T) {
  const extension = extensionByMimeType[document.mimeType] ?? "";
  const safeTitle = document.title
    .replaceAll("/", "-")
    .replaceAll("\\", "-")
    .replace(/[\u0000-\u001f]/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 120) || "employee-document";
  const downloadName = Object.values(extensionByMimeType).some(ext => safeTitle.toLowerCase().endsWith(ext)) ? safeTitle : safeTitle + extension;
  return {
    ...document,
    originalName: downloadName,
    description: null,
    uploadedAt: document.createdAt
  };
}
