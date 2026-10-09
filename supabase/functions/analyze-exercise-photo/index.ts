// Deploy with: supabase functions deploy analyze-exercise-photo
// Configure the secret OPENAI_API_KEY in Supabase (never in the client).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const itemTypes = new Set(["cone", "hat", "attacker", "defender", "trainer", "ball", "goal", "runLine", "passLine", "guideLine"]);
const lineTypes = new Set(["runLine", "passLine", "guideLine"]);
const colors = new Set(["white", "orange", "yellow", "red", "blue", "green"]);
const styles = new Set(["straight", "zigzag", "arc", "bounce", "passeer"]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

function normalizedItems(items: unknown) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 120).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (!itemTypes.has(String(entry.type))) return [];
    const x = Number(entry.x), y = Number(entry.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    const clamp = (v: number) => Math.min(0.98, Math.max(0.02, v));
    const type = String(entry.type);
    const result: Record<string, unknown> = { id: `import-${index}`, type, x: clamp(x), y: clamp(y) };
    if (lineTypes.has(type)) {
      const x2 = Number(entry.x2), y2 = Number(entry.y2);
      if (!Number.isFinite(x2) || !Number.isFinite(y2)) return [];
      result.x2 = clamp(x2);
      result.y2 = clamp(y2);
      if (styles.has(String(entry.lineStyle))) result.lineStyle = entry.lineStyle;
    }
    if (type === "hat") result.color = colors.has(String(entry.color)) ? entry.color : "yellow";
    if (type === "goal") result.rotation = Number.isFinite(Number(entry.rotation)) ? Number(entry.rotation) : 0;
    return [result];
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Authentication required." }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!url || !anon || !key) return json({ error: "AI import is not configured." }, 503);
    const supabase = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Authentication failed." }, 401);
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profileError || profile?.role !== "super_admin") return json({ error: "Insufficient permissions." }, 403);

    const body = await request.json();
    const mimeType = String(body?.mimeType || "");
    const base64 = String(body?.base64 || "");
    if (!allowedTypes.has(mimeType) || !/^[A-Za-z0-9+/=]+$/.test(base64) || base64.length > 7_000_000) {
      return json({ error: "Choose a JPEG, PNG or WebP image smaller than 5 MB." }, 400);
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `Analyze a field hockey coaching drill image. Output only JSON object with title, subtitle, explanation, instructions, and items. items is an array of editable diagram pieces. Each item: type (cone, hat, attacker, defender, trainer, ball, goal, runLine, passLine, guideLine), x, y normalized 0..1. Lines need x2,y2 and optional lineStyle (straight, zigzag, arc, bounce, passeer). Hats optional color white/orange/yellow/red/blue/green. Goals optional rotation number. Positions must match the visual hockey diagram. If the picture is not a diagram, return items:[] rather than inventing. Be cautious with uncertain elements. Write human readable fields in Dutch and never copy visible personal/contact information.` },
          { role: "user", content: [
            { type: "text", text: "Convert this hockey exercise photo to editable pieces and draft an exercise description. Any guesswork must be conservative." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
          ] },
        ],
      }),
    });
    if (!response.ok) return json({ error: "Image analysis failed. Please try again." }, 502);
    const result = await response.json();
    const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}");
    const safeText = (v: unknown) => typeof v === "string" ? v.slice(0, 4000) : "";
    return json({
      title: safeText(parsed.title).slice(0, 160),
      subtitle: safeText(parsed.subtitle).slice(0, 300),
      explanation: safeText(parsed.explanation),
      instructions: safeText(parsed.instructions),
      board_layout: { fieldMode: "half", items: normalizedItems(parsed.items) },
    });
  } catch {
    return json({ error: "Could not analyze this image." }, 500);
  }
});
