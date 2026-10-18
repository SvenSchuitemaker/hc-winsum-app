// ChatGPT/external importer: submit already-cropped field images and recognized text.
// Deploy with --no-verify-jwt; authentication is enforced below using a dedicated secret.
// Never expose EXERCISE_IMPORT_TOKEN or SUPABASE_SERVICE_ROLE_KEY in client code.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_ITEMS = 12;
const MAX_BODY_BYTES = 42_000_000;
const MAX_IMAGE_BYTES = 5_000_000;
const BUCKET = "exercise-previews";
const audiences = new Set(["JO8", "JO10", "JO12", "JO14", "JO16", "JO18", "MO8", "MO10", "MO12", "MO14", "MO16", "MO18", "Senioren"]);
const difficulties = new Set(["Makkelijk", "Gemiddeld", "Moeilijk"]);
const imageTypes: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function safeString(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
function equalSecret(given: string, expected: string): boolean {
  // Compare all bytes without bailing out at the first mismatch.
  const encoder = new TextEncoder();
  const a = encoder.encode(given), b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
function decodeImage(raw: unknown): { bytes: Uint8Array; mime: string; extension: string } {
  if (!raw || typeof raw !== "object") throw new Error("image is required, with mimeType and base64.");
  const image = raw as Record<string, unknown>;
  const mime = String(image.mimeType || "");
  if (!imageTypes[mime]) throw new Error("Image must be JPEG, PNG or WebP.");
  const base64 = String(image.base64 || "").replace(/^data:image\/(?:jpeg|png|webp);base64,/, "");
  if (!base64 || base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new Error("Invalid image data or image exceeds 5 MB.");
  }
  const binary = atob(base64);
  if (binary.length > MAX_IMAGE_BYTES) throw new Error("Image exceeds 5 MB.");
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.slice(0, 8).every((n, i) => n === [137,80,78,71,13,10,26,10][i]);
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(mime === "image/jpeg" && jpeg || mime === "image/png" && png || mime === "image/webp" && webp)) {
    throw new Error("Image file signature does not match its MIME type.");
  }
  return { bytes, mime, extension: imageTypes[mime] };
}
function normalize(raw: unknown) {
  if (!raw || typeof raw !== "object") throw new Error("Exercise must be an object.");
  const item = raw as Record<string, unknown>;
  const title = safeString(item.title, 160);
  const category_slug = safeString(item.category_slug, 120);
  if (!title || !category_slug) throw new Error("title and category_slug are required.");
  const difficulty = safeString(item.difficulty, 24);
  if (!difficulties.has(difficulty)) throw new Error("difficulty must be Makkelijk, Gemiddeld or Moeilijk.");
  if (!Array.isArray(item.audience) || !item.audience.length ||
      !item.audience.every((v) => typeof v === "string" && audiences.has(v))) {
    throw new Error("audience must contain valid age groups.");
  }
  const image = decodeImage(item.image);
  return {
    title, category_slug, difficulty,
    audience: [...new Set(item.audience as string[])],
    subtitle: safeString(item.subtitle, 300) || null,
    explanation: safeString(item.explanation, 8000) || null,
    instructions: safeString(item.instructions, 8000) || null,
    simplify: safeString(item.simplify, 4000) || null,
    build_up: safeString(item.build_up, 4000) || null,
    image,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "POST required." }, 405);
  // Do not permit browser cross-origin submission; intended for server-to-server use.
  const configured = Deno.env.get("EXERCISE_IMPORT_TOKEN") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!configured || configured.length < 32 || !url || !serviceKey) return response({ error: "Import service is not configured." }, 503);
  const supplied = request.headers.get("x-import-token") || "";
  if (!supplied || !equalSecret(supplied, configured)) return response({ error: "Unauthorized." }, 401);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return response({ error: "Payload too large." }, 413);
  let rawBody: string;
  try {
    rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) return response({ error: "Payload too large." }, 413);
  } catch { return response({ error: "Could not read request." }, 400); }

  let input: unknown;
  try { input = JSON.parse(rawBody); } catch { return response({ error: "Invalid JSON." }, 400); }
  const value = input as Record<string, unknown> | null;
  if (!value || !Array.isArray(value.exercises) || value.exercises.length < 1 || value.exercises.length > MAX_ITEMS) {
    return response({ error: "exercises must contain 1 to 12 items." }, 400);
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: categories, error: categoryError } = await supabase.from("categories").select("slug,title");
  if (categoryError || !categories) return response({ error: "Could not load categories." }, 503);
  const categorySlugs = new Set(categories.map(c => String(c.slug)));
  const results: Array<Record<string, unknown>> = [];
  for (let index = 0; index < value.exercises.length; index++) {
    let item: ReturnType<typeof normalize>;
    try {
      item = normalize(value.exercises[index]);
      if (!categorySlugs.has(item.category_slug)) throw new Error("Unknown category_slug; fetch existing categories first.");
    } catch (e) {
      results.push({ index, status: "invalid", error: String((e as Error).message) });
      continue;
    }
    // Exact title+category is an intentionally conservative duplicate guard.
    const { data: existing, error: duplicateError } = await supabase.from("exercises")
      .select("id,title").eq("category_slug", item.category_slug).ilike("title", item.title).limit(1);
    if (duplicateError) {
      results.push({ index, status: "error", error: "Duplicate check failed." });
      continue;
    }
    if (existing?.length) {
      results.push({ index, status: "duplicate", title: item.title, id: existing[0].id });
      continue;
    }
    const path = `chat-import/${crypto.randomUUID()}.${item.image.extension}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET)
      .upload(path, item.image.bytes, { contentType: item.image.mime, upsert: false });
    if (uploadError) {
      results.push({ index, status: "error", title: item.title, error: "Image upload failed." });
      continue;
    }
    const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { data: saved, error: insertError } = await supabase.from("exercises").insert({
      title: item.title, category_slug: item.category_slug, difficulty: item.difficulty,
      audience: item.audience, subtitle: item.subtitle, explanation: item.explanation,
      instructions: item.instructions, simplify: item.simplify, build_up: item.build_up,
      image_url: publicUrl.publicUrl, board_layout: null,
    }).select("id,title,category_slug,image_url").single();
    if (insertError || !saved) {
      await supabase.storage.from(BUCKET).remove([path]);
      results.push({ index, status: "error", title: item.title, error: "Database insert failed; image rolled back." });
      continue;
    }
    results.push({ index, status: "created", id: saved.id, title: saved.title,
      category_slug: saved.category_slug, image_url: saved.image_url,
      exercise_url: `https://svenschuitemaker.github.io/hc-winsum-app/exercise/${saved.id}` });
  }
  return response({
    created: results.filter(r => r.status === "created").length,
    duplicates: results.filter(r => r.status === "duplicate").length,
    failed: results.filter(r => r.status === "invalid" || r.status === "error").length,
    results,
  }, results.every(r => r.status === "created" || r.status === "duplicate") ? 200 : 207);
});
