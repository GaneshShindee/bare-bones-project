import { supabase } from "@/integrations/supabase/client";

export const MAX_RESUME_BYTES = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_RESUME_MIME = new Set<string>([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function isAllowedResumeFile(file: File) {
  if (file.size > MAX_RESUME_BYTES) return { ok: false, reason: "File exceeds 25 MB limit." };
  if (!ALLOWED_RESUME_MIME.has(file.type) && !/\.(pdf|docx?|DOCX?|PDF)$/.test(file.name)) {
    return { ok: false, reason: "Only PDF, DOC, or DOCX files are allowed." };
  }
  return { ok: true as const };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Upload the raw file to the private 'resumes' bucket at <userId>/<uuid>/<filename>. */
export async function uploadResumeFile(userId: string, file: File): Promise<{ path: string }> {
  const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
  const path = `${userId}/${id}/${safeName}`;
  const { error } = await supabase.storage.from("resumes").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return { path };
}

/** Read a file as base64 string in the browser. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const result = reader.result as string;
      const i = result.indexOf(",");
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}