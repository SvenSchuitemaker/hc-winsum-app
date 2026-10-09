// Deploy with: supabase functions deploy analyze-exercise-photo
// Configure the secret OPENAI_API_KEY in Supabase (never in the client).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const itemTypes = new Set(["cone", "hat", "attacker", "defender", "trainer", "ball", "goal", "runLine", "passLine", "guideLine", "player", "text"]);
const lineTypes = new Set(["runLine", "passLine", "guideLine"]);
const colors = new Set(["white", "orange", "yellow", "red", "blue", "green"]);
const styles = new Set(["straight", "zigzag", "arc", "bounce", "passeer"]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

type Point = { x: number; y: number };
type FieldCalibration = {
  bounds: { left: number; top: number; right: number; bottom: number };
  rotation: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  goalEdge?: "top" | "right" | "bottom" | "left" | "unknown";
  corners?: { tl: Point; tr: Point; br: Point; bl: Point };
};

// Coordinates returned by the vision model are in the full source image.
// Remove margins around the detected field before rotating to our goal-at-top editor.
function parseCalibration(raw: unknown): FieldCalibration {
  const fallback: FieldCalibration = {
    bounds: { left: 0, top: 0, right: 1, bottom: 1 },
    rotation: 0,
    flipHorizontal: false,
  };
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  const b = obj.bounds;
  if (!b || typeof b !== "object") return fallback;
  const box = b as Record<string, unknown>;
  const values = ["left", "top", "right", "bottom"].map((key) => Number(box[key]));
  if (values.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) return fallback;
  const [left, top, right, bottom] = values;
  if (right - left < 0.2 || bottom - top < 0.2) return fallback;
  // The goal edge is a more reliable orientation instruction than a generated angle.
  // A goal at the top needs NO rotation, even for a portrait/cropped source.
  const goalEdge = ["top", "right", "bottom", "left", "unknown"].includes(String(obj.goalEdge))
    ? String(obj.goalEdge) as FieldCalibration["goalEdge"] : "unknown";
  const rotationByGoalEdge = { top: 0, right: 270, bottom: 180, left: 90 } as const;
  const rotation = goalEdge && goalEdge !== "unknown"
    ? rotationByGoalEdge[goalEdge]
    : 0; // Do not trust arbitrary model rotations without a visible goal edge.
  // Optional perspective correction when all four visible field corners are known.
  // Keep the axis-aligned bounds fallback if corners are missing or implausible.
  const rawCorners = obj.corners as Record<string, unknown> | undefined;
  let corners: FieldCalibration["corners"];
  if (rawCorners && typeof rawCorners === "object") {
    const getPoint = (key: string): Point | null => {
      const raw = rawCorners[key];
      if (!raw || typeof raw !== "object") return null;
      const point = raw as Record<string, unknown>;
      const x = Number(point.x), y = Number(point.y);
      return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
    };
    const tl = getPoint("tl"), tr = getPoint("tr"), br = getPoint("br"), bl = getPoint("bl");
    if (tl && tr && br && bl) {
      const area = Math.abs(
        tl.x * tr.y - tr.x * tl.y + tr.x * br.y - br.x * tr.y +
        br.x * bl.y - bl.x * br.y + bl.x * tl.y - tl.x * bl.y
      ) / 2;
      const edge = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
      // Reject implausible/crossed quadrilaterals and hallucinated field corners.
      // A bad transform is far worse than a slightly imperfect rectangular crop.
      const signedCross = (a: Point, b: Point, c: Point) =>
        (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const winding = [
        signedCross(tl, tr, br), signedCross(tr, br, bl),
        signedCross(br, bl, tl), signedCross(bl, tl, tr),
      ];
      const convex = winding.every((v) => v > 0.0001) || winding.every((v) => v < -0.0001);
      const quadBounds = {
        left: Math.min(tl.x, tr.x, br.x, bl.x),
        top: Math.min(tl.y, tr.y, br.y, bl.y),
        right: Math.max(tl.x, tr.x, br.x, bl.x),
        bottom: Math.max(tl.y, tr.y, br.y, bl.y),
      };
      const withinBounds =
        Math.abs(quadBounds.left - left) < 0.12 &&
        Math.abs(quadBounds.top - top) < 0.12 &&
        Math.abs(quadBounds.right - right) < 0.12 &&
        Math.abs(quadBounds.bottom - bottom) < 0.12;
      const horizontalRatio = Math.max(edge(tl, tr), edge(bl, br)) /
        Math.max(0.0001, Math.min(edge(tl, tr), edge(bl, br)));
      const verticalRatio = Math.max(edge(tl, bl), edge(tr, br)) /
        Math.max(0.0001, Math.min(edge(tl, bl), edge(tr, br)));
      if (convex && withinBounds && horizontalRatio < 1.6 && verticalRatio < 1.6 &&
          area > 0.08 && edge(tl, tr) > 0.2 && edge(bl, br) > 0.2 &&
          edge(tl, bl) > 0.2 && edge(tr, br) > 0.2) {
        corners = { tl, tr, br, bl };
      }
    }
  }
  return { bounds: { left, top, right, bottom }, rotation, flipHorizontal: obj.flipHorizontal === true && goalEdge !== "unknown", goalEdge, corners };
}

// Invert the bilinear map through four detected source-image field corners.
// Unlike a simple bounding box, this compensates for mild perspective/skew.
function inverseFieldQuad(point: Point, corners: NonNullable<FieldCalibration["corners"]>): Point | null {
  const { tl, tr, br, bl } = corners;
  const ax = tr.x - tl.x, ay = tr.y - tl.y;
  const bx = bl.x - tl.x, by = bl.y - tl.y;
  const cx = tl.x - tr.x + br.x - bl.x;
  const cy = tl.y - tr.y + br.y - bl.y;
  let u = 0.5, v = 0.5;
  for (let iteration = 0; iteration < 12; iteration++) {
    const fx = tl.x + ax * u + bx * v + cx * u * v - point.x;
    const fy = tl.y + ay * u + by * v + cy * u * v - point.y;
    const j11 = ax + cx * v, j12 = bx + cx * u;
    const j21 = ay + cy * v, j22 = by + cy * u;
    const determinant = j11 * j22 - j12 * j21;
    if (Math.abs(determinant) < 1e-7) return null;
    const du = (fx * j22 - fy * j12) / determinant;
    const dv = (j11 * fy - j21 * fx) / determinant;
    u -= du;
    v -= dv;
    if (!Number.isFinite(u) || !Number.isFinite(v) || Math.abs(u) > 5 || Math.abs(v) > 5) return null;
    if (Math.abs(du) + Math.abs(dv) < 1e-7) break;
  }
  return { x: u, y: v };
}

function calibratedPoint(x: number, y: number, calibration: FieldCalibration): Point {
  const { left, right, top, bottom } = calibration.bounds;
  const candidate = calibration.corners ? inverseFieldQuad({ x, y }, calibration.corners) : null;
  const corrected = candidate && candidate.x >= -0.08 && candidate.x <= 1.08 &&
    candidate.y >= -0.08 && candidate.y <= 1.08 ? candidate : null;
  const u = corrected?.x ?? (x - left) / (right - left);
  const v = corrected?.y ?? (y - top) / (bottom - top);
  let transformed: Point;
  switch (calibration.rotation) {
    case 90: transformed = { x: 1 - v, y: u }; break;
    case 180: transformed = { x: 1 - u, y: 1 - v }; break;
    case 270: transformed = { x: v, y: 1 - u }; break;
    default: transformed = { x: u, y: v };
  }
  if (calibration.flipHorizontal) transformed.x = 1 - transformed.x;
  return { x: Math.min(0.98, Math.max(0.02, transformed.x)), y: Math.min(0.98, Math.max(0.02, transformed.y)) };
}

function normalizedItems(items: unknown, calibration: FieldCalibration) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 120).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (!itemTypes.has(String(entry.type))) return [];
    const x = Number(entry.x), y = Number(entry.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    const point = calibratedPoint(x, y, calibration);
    const type = String(entry.type);
    const result: Record<string, unknown> = { id: `import-${index}`, type, x: point.x, y: point.y };
    if (lineTypes.has(type)) {
      const x2 = Number(entry.x2), y2 = Number(entry.y2);
      if (!Number.isFinite(x2) || !Number.isFinite(y2)) return [];
      const end = calibratedPoint(x2, y2, calibration);
      result.x2 = end.x;
      result.y2 = end.y;
      if (styles.has(String(entry.lineStyle))) result.lineStyle = entry.lineStyle;
    }
    if (type === "player") {
      const shirtColor = String(entry.shirtColor || "").toLowerCase();
      result.shirtColor = ["black", "orange", "blue", "grey", "white", "red", "green"].includes(shirtColor) ? shirtColor : "blue";
      result.label = typeof entry.label === "string" ? entry.label.slice(0, 12) : "";
    }
    if (type === "text") {
      result.text = typeof entry.text === "string" ? entry.text.slice(0, 80) : "";
      if (!result.text) return [];
    }
    if (lineTypes.has(type)) {
      if (typeof entry.strokeColor === "string" && /^#[0-9a-fA-F]{6}$/.test(entry.strokeColor)) result.strokeColor = entry.strokeColor;
      if (typeof entry.dashed === "boolean") result.dashed = entry.dashed;
      if (typeof entry.arrowHead === "boolean") result.arrowHead = entry.arrowHead;
    }
    if (type === "hat") result.color = colors.has(String(entry.color)) ? entry.color : "yellow";
    if (type === "goal") result.rotation = Number.isFinite(Number(entry.rotation)) ? Number(entry.rotation) : 0;
    return [result];
  });
}

// A second, focused vision pass avoids confusing exercise arrows with field markings.
async function analyzeArrows(key: string, model: string, mimeType: string, base64: string): Promise<unknown[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are tracing ONLY distinct arrows drawn over a field hockey diagram. Return JSON {items:[{type,x,y,x2,y2,strokeColor,dashed,arrowHead,lineStyle}]}. Use full-image normalized 0..1 coordinates. Output one item per genuine dark/black arrow. type=guideLine, strokeColor=#111111, dashed=false, arrowHead=true, lineStyle=straight unless the visible arrow is actually curved. Locate the center of each arrow tail and precise arrow TIP. Exclude white field boundaries and circles, player shirt seams, and decorative marks. If none visible return items:[]. Do not add players or cones." },
        { role: "user", content: [
          { type: "text", text: "Trace only the original drawn arrows, preserving direction and endpoints. Return the original image coordinates." },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
        ] },
      ],
    }),
  });
  if (!response.ok) return [];
  const result = await response.json();
  try {
    const content = JSON.parse(result.choices?.[0]?.message?.content || "{}");
    return Array.isArray(content.items) ? content.items : [];
  } catch { return []; }
}

function deduplicateDetections(items: Array<Record<string, unknown>>) {
  const seen: Array<Record<string, unknown>> = [];
  for (const item of items) {
    const x = Number(item.x), y = Number(item.y);
    const line = lineTypes.has(String(item.type));
    if (seen.some((previous) => {
      if (line !== lineTypes.has(String(previous.type))) return false;
      if (line) {
        return Math.hypot(x - Number(previous.x), y - Number(previous.y)) < 0.025
          && Math.hypot(Number(item.x2) - Number(previous.x2), Number(item.y2) - Number(previous.y2)) < 0.025;
      }
      return item.type === previous.type && item.label === previous.label
        && Math.hypot(x - Number(previous.x), y - Number(previous.y)) < 0.018;
    })) continue;
    seen.push(item);
  }
  return seen;
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
    // Report missing variable *names* only; never expose secret values.
    const missing = [
      !url ? "SUPABASE_URL" : null,
      !anon ? "SUPABASE_ANON_KEY" : null,
      !key ? "OPENAI_API_KEY" : null,
    ].filter(Boolean);
    if (missing.length) return json({ error: `AI-import is niet geconfigureerd. Ontbrekende Supabase-instelling(en): ${missing.join(", ")}.` }, 503);
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

    const visionModel = Deno.env.get("OPENAI_EXERCISE_VISION_MODEL") || "gpt-4o";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Use a full vision-capable model for pixel-position analysis; configurable for budgets.
        model: visionModel,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `You are an accurate field hockey exercise diagram TRACER, not a diagram designer. Return one JSON object: title, subtitle, explanation, instructions, calibration, items.

GEOMETRY FIRST: calibration={bounds:{left,top,right,bottom},goalEdge,rotation,flipHorizontal,corners?}. corners is OPTIONAL and must be {tl:{x,y},tr:{x,y},br:{x,y},bl:{x,y}} in full ORIGINAL image coordinates, where tl/tr/br/bl are the four corners of the same visible hockey field rectangle in image orientation. Return corners ONLY when all four edges/corners are clearly visible and confidently identified; do not hallucinate corners outside the image. The server will use the four corners for mild perspective/skew compensation and otherwise fall back to bounds. All numbers are fractions of the FULL uploaded image [0,1]. Find the top, right, bottom, left borders of the actual rectangular green field (not the outer white canvas or UI). Only crop to clearly visible boundaries; otherwise bounds={left:0,top:0,right:1,bottom:1}. goalEdge must be top/right/bottom/left ONLY when an actual rectangular goal and/or solid shooting circle visibly indicates the attacking end; otherwise unknown. In particular, if the goal is physically at the TOP of the image, goalEdge MUST be "top" even when the picture is taller than wide. rotation is informational; the server computes rotation from goalEdge. Do not mirror by default: flipHorizontal=false except when unmistakably necessary.

TRACE BEFORE INTERPRETING: Study every individual object in source-image coordinates. Return only clearly drawn object centers, one JSON item per object, in the ORIGINAL image frame, NOT cropped, rotated, or moved. No rearrangement, equal spacing, inferred missing teammates, or tidy symmetrical formations. A player jersey icon is ONE player, not a cone; a numbered black jersey is still ONE player. Cones are the small triangular/tall traffic-cone icons; plain little white dots along a hockey field line are PRINTED FIELD MARKINGS and must NOT become balls. For every distinct JERSEY use type="player" and return shirtColor (black,orange,blue,grey,white,red,green) and label (visible jersey number or T; empty if none). Preserve shirt COLOR and NUMBERS literally; never convert shirt icons to attacker or defender circles. Preserve text as separate type="text" item with text exactly as printed (e.g. Steunspeler) and its center coordinates. Orange jerseys are player items, never cones. Keep all visible player positions even if colors repeat; never invent defensive formations, lines or extra objects. Use "hat" for flat colored marker discs only, "cone" for standing cones. Only output a separate "ball" if a distinct ball icon is clearly visible.

LINE TRACING: For every visible black arrow, create exactly one line item with strokeColor="#111111", dashed=false, arrowHead=true; with its original x,y start and x2,y2 end at the actual arrow tip. Type passLine for a ball pass and runLine for a player movement when obvious; default guideLine if unclear. Do NOT turn white field markings/circles into exercise lines. Keep original directions. Every line endpoint uses normalized FULL image coordinates. Never add speculative arrows.

JSON items: {type,x,y,x2?,y2?,lineStyle?,color?,rotation?,shirtColor?,label?,text?,strokeColor?,dashed?,arrowHead?}. Types: cone,hat,attacker,defender,trainer,ball,goal,runLine,passLine,guideLine,player,text. Lines require x2,y2, optional lineStyle straight/zigzag/arc/bounce/passeer. Hats may have color white/orange/yellow/red/blue/green. Output object centers and line endpoints with THREE decimal places. Be meticulous with geometry and count; do not create approximate diagrams from a verbal interpretation. Write description fields in Dutch, never reproduce personal/contact information. If not a diagram, items=[].` },
          { role: "user", content: [
            { type: "text", text: "Convert this hockey exercise photo to editable pieces and draft an exercise description. Any guesswork must be conservative." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
          ] },
        ],
      }),
    });
    if (!response.ok) {
      // Never return credentials, raw provider responses, or submitted images.
      let providerCode = "";
      try {
        const failure = await response.json();
        providerCode = typeof failure?.error?.code === "string" ? failure.error.code : "";
      } catch {
        // Provider may return a non-JSON error page.
      }
      let message = "AI-analyse mislukt bij de AI-dienst. Probeer het later opnieuw.";
      if (response.status === 401 || providerCode === "invalid_api_key") {
        message = "De OpenAI API-sleutel is ongeldig. Controleer OPENAI_API_KEY in Supabase Secrets.";
      } else if (providerCode === "insufficient_quota") {
        message = "Het OpenAI API-account heeft onvoldoende API-tegoed. Controleer Billing en Usage op platform.openai.com.";
      } else if (response.status === 429) {
        message = "OpenAI heeft een gebruikslimiet bereikt. Controleer API-tegoed en limieten of probeer later opnieuw.";
      } else if (response.status === 403) {
        message = "Het OpenAI-project heeft geen toegang tot deze AI-aanvraag. Controleer de projectrechten.";
      } else if (response.status === 400 || response.status === 404) {
        message = "OpenAI accepteert deze afbeelding of dit model niet. Controleer het AI-model en probeer een andere foto.";
      }
      return json({ error: message, provider_status: response.status, provider_code: providerCode || null }, 502);
    }
    const result = await response.json();
    const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}");
    const calibration = parseCalibration(parsed.calibration);
    // The initial pass finds jerseys/cones/text and calibrates the field. Trace arrows
    // separately to avoid a common failure mode where players are connected arbitrarily.
    let arrowItems: unknown[] = [];
    try {
      arrowItems = await analyzeArrows(key!, visionModel, mimeType, base64);
    } catch {
      // A transient second-pass failure must not discard a successful first pass.
    }
    const visualItems = Array.isArray(parsed.items)
      ? parsed.items.filter((item: Record<string, unknown>) => !lineTypes.has(String(item?.type))) : [];
    const fallbackArrows = Array.isArray(parsed.items)
      ? parsed.items.filter((item: Record<string, unknown>) => lineTypes.has(String(item?.type))) : [];
    const normalized = normalizedItems([...visualItems, ...(arrowItems.length ? arrowItems : fallbackArrows)], calibration);
    const uniqueItems = deduplicateDetections(normalized);
    const safeText = (v: unknown) => typeof v === "string" ? v.slice(0, 4000) : "";
    return json({
      title: safeText(parsed.title).slice(0, 160),
      subtitle: safeText(parsed.subtitle).slice(0, 300),
      explanation: safeText(parsed.explanation),
      instructions: safeText(parsed.instructions),
      board_layout: { fieldMode: "half", items: uniqueItems },
    });
  } catch {
    return json({ error: "Could not analyze this image." }, 500);
  }
});
