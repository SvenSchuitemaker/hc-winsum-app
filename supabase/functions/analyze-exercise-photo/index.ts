// Deploy with: supabase functions deploy analyze-exercise-photo
// Configure the secret GEMINI_API_KEY in Supabase (never in the client).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
async function geminiFetch(_url: string, init: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init.body || "{}"));
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return new Response(JSON.stringify({error:{code:"missing_api_key"}}),{status:503});
  const parts: Array<Record<string, unknown>> = [];
  const instructions: string[] = [];
  for (const msg of body.messages ?? []) {
    if (msg.role === "system") { instructions.push(String(msg.content)); continue; }
    if (typeof msg.content === "string") { parts.push({text:msg.content}); continue; }
    for (const p of msg.content ?? []) {
      if (p.type === "text") parts.push({text:p.text});
      if (p.type === "image_url") {
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(p.image_url?.url || ""));
        if (match) parts.push({inlineData:{mimeType:match[1],data:match[2]}});
      }
    }
  }
  const model=Deno.env.get("GEMINI_EXERCISE_VISION_MODEL") || "gemini-3.8-flash";
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
    method:"POST",headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
    body:JSON.stringify({
      systemInstruction:{parts:[{text:instructions.join("\n\n")}]},
      contents:[{role:"user",parts}],
      generationConfig:{responseMimeType:"application/json",temperature:0.1}
    })
  });
  if (!response.ok) return response;
  const result=await response.json();
  const content=(result.candidates?.[0]?.content?.parts ?? []).map((p:{text?:string})=>p.text || "").join("");
  if (!content) return new Response(JSON.stringify({error:{code:"empty_response"}}),{status:502});
  return new Response(JSON.stringify({choices:[{message:{content}}]}),{headers:{"Content-Type":"application/json"}});
}


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
  // The overlay uses this same rectangular crop transform. Perspective corner
  // estimates are not applied independently until the overlay can warp too.
  const candidate = null as Point | null;
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

// Classify numbered symbols with surrounding visual evidence, not just a
// single unreliable Gemini boolean. Coordinates here are FULL SOURCE image.
function normalizePrintedEquipment(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const type = String(entry.type ?? "").toLowerCase();
  if (["hat", "marker", "disc", "disk", "flatcone", "flat_cone", "pylon", "pion", "conicalmarker"].includes(type))
    return { ...entry, type: "cone" };
  if (type === "player") {
    const label = String(entry.label ?? entry.text ?? "").trim();
    return { ...entry, type: "player", label: /^\\d+\\.$/.test(label) ? label.slice(0, -1) : label };
  }
  return { ...entry };
}

function promotePrintedPlayers(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const distance = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  const numeric = (v: unknown) => /^([1-9][0-9]?)\.?$/.exec(String(v ?? "").trim());
  const actors = items.filter(i => ["player", "attacker", "defender", "trainer"].includes(String(i.type)));
  return items.flatMap(item => {
    if (item.type !== "text") return [item];
    const number = numeric(item.text ?? item.label);
    if (!number) return [item];
    const x = Number(item.x), y = Number(item.y);
    if (![x, y].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) return [item];
    const context = [item.role, item.semanticType, item.symbolType, item.visualType, item.description]
      .map(v => String(v ?? "").toLowerCase()).join(" ");
    const negative = /step|stap|fase|afstand|meter|metre|distance|repeat|herhaling|cone|pylon|marker|disc|hat|goal|doel/.test(context);
    if (negative || item.representsPlayer === false) return [item];
    const explicit = item.representsPlayer === true || /player|speler|shirt|jersey|pawn|persoon/.test(context);
    const nearestActor = actors.map(actor => ({actor, d: distance(item, actor)})).sort((a,b) => a.d-b.d)[0];
    // Numeric overlay on an existing jersey: keep the jersey, apply its number.
    if (nearestActor && nearestActor.d < 0.025) {
      if (nearestActor.actor.type === "player" &&
          !String(nearestActor.actor.label ?? "").trim()) {
        nearestActor.actor.label = number[1];
        return [];
      }
      return [item]; // Conflicting annotation is not an additional player.
    }
    // An ordinary digit near equipment is ambiguous unless the model saw a
    // player symbol. Never turn a numbered cone or drill step into a shirt.
    const visualEvidence = /player|speler|shirt|jersey|pawn|persoon|circle|cirkel|silhouette|figuur/.test(context);
    // A player number may be immediately beside a cone. A cone nearby is
    // not a reason to discard an independently classified player symbol.
    // Only a near-identical equipment center is too ambiguous to promote.
    const onEquipment = items.some(other => other.type === "cone" && distance(item, other) < 0.012);
    if (!visualEvidence && !explicit || onEquipment) return [item];
    const player: Record<string, unknown> = {
      ...item, type: "player", label: number[1],
      shirtColor: ["black","orange","blue","white","red","green"].includes(String(item.shirtColor))
        ? item.shirtColor : "black",
    };
    delete player.text;
    actors.push(player);
    return [player];
  });
}

// One bounded specialist pass, also for partially detected markers.
async function recoverPrintedCones(key: string, model: string, mimeType: string, base64: string): Promise<{cones: Record<string, unknown>[]; numberedPlayers: Record<string, unknown>[]}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 11000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: "Look ONLY inside the printed hockey exercise field. Find every physically depicted training cone or marker: tiny grey/black triangles, colored traffic cones, flat discs, pylons, outlined cones and marker icons, even if next to player numbers. Also identify printed player symbols marked with digits such as 1., 2. where the number VISIBLY designates a person (not a step, a cone, or a distance). Return JSON {cones:[{x:0.5,y:0.5}],numberedPlayers:[{x:0.3,y:0.4,label:1}]} with real visual centers in NORMALIZED FULL PHOTO coordinates (0..1). Include only independently visible numbered PLAYER pictograms, whether the number is inside or directly adjacent to the symbol. If the digit is merely step text or ambiguous, do not include it. Do not count player shirts, people, player numbers, arrows, field lines, field markings, text, or goals. Never invent missing cones or complete a pattern. If no markers/numbered player symbols are visible, return cones:[],numberedPlayers:[]." },
            { inlineData: { mimeType, data: base64 } },
          ] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1024 },
        }),
      },
    );
    if (!response.ok) return { cones: [], numberedPlayers: [] };
    const result = await response.json();
    const content = (result.candidates?.[0]?.content?.parts ?? [])
      .map((part: { text?: string }) => part.text ?? "").join("");
    const parsed = JSON.parse(content || "{}");
    if (!Array.isArray(parsed.cones)) return { cones: [], numberedPlayers: [] };
    const cones: Array<{ type: "cone"; x: number; y: number }> = [];
    for (const raw of parsed.cones.slice(0, 60)) {
      const x = Number(raw?.x), y = Number(raw?.y);
      if (![x, y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) continue;
      if (cones.some((previous) => Math.hypot(previous.x - x, previous.y - y) < 0.012)) continue;
      cones.push({ type: "cone", x, y });
    }
    const numberedPlayers: Record<string, unknown>[] = [];
    for (const raw of (Array.isArray(parsed.numberedPlayers) ? parsed.numberedPlayers : []).slice(0, 50)) {
      const label = /^([1-9][0-9]?)\.?$/.exec(String(raw?.label ?? "").trim());
      const x = Number(raw?.x), y = Number(raw?.y);
      if (!label || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) continue;
      if (numberedPlayers.some(previous => previous.label === label[1] && Math.hypot(Number(previous.x)-x,Number(previous.y)-y) < 0.025)) continue;
      numberedPlayers.push({type:"player",label:label[1],shirtColor:"black",x,y});
    }
    return { cones, numberedPlayers };
  } catch {
    return { cones: [], numberedPlayers: [] };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizedItems(items: unknown, calibration: FieldCalibration) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 120).flatMap((item, index) => {
    const entry = normalizePrintedEquipment(item);
    if (!entry || !itemTypes.has(String(entry.type))) return [];
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

// Separate inventory pass: count every actual visible object before the
// normal coordinate/label alignment. A list entry is one physical object,
// including adjacent/overlapping shirts. No expected team sizes are assumed.
async function analyzeObjectInventory(key: string, model: string, mimeType: string, base64: string): Promise<unknown[] | null> {
  return null; // Disabled in fast Gemini mode: avoid Edge execution timeout.
  const response = await geminiFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, temperature: 0, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Inventory a field hockey drill image BEFORE drawing it. Return JSON {"objects":[{"type":"player","x":0.5,"y":0.5,"shirtColor":"black","label":"1"},...]}. Each entry represents one and ONLY one visible physical object. Enumerate ALL shirts individually, even when their icons touch or overlap, in careful top-to-bottom order; never straighten rows, change spacing or invent players to complete teams. Every shirt has type player and shirtColor black/orange/blue/grey/white/red/green, and printed label (number, T, or "" if unreadable). Trainer T is a separate grey shirt. Count each genuine cone, ball, disc/hat, goal and written text separately too (type cone/ball/hat/goal/text; for text include "text" exactly as shown). Objects use centers in normalized FULL SOURCE IMAGE coordinates 0..1 with three decimals. Keep overlapping objects with different centers or identities; do not collapse close teammates. Ignore printed white field markings, field lines, arrows, borders, background artwork and screenshot interface elements. Pass and run arrows are traced in a separate pass, do not include arrows here. Only return objects that actually appear, irrespective of the specific exercise formation. Output no additional commentary.` },
        { role: "user", content: [
          { type: "text", text: "First count every distinct physical object, then return the complete one-object-per-entry inventory at its actual pixel center. Do not omit nearby or overlapping shirts." },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
        ] },
      ],
    }),
  });
  if (!response.ok) return null;
  try {
    const result = await response.json();
    const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}");
    return Array.isArray(parsed.objects) && parsed.objects.length <= 120 ? parsed.objects : null;
  } catch { return null; }
}

// A second, focused vision pass avoids confusing exercise arrows with field markings.
async function analyzeArrows(key: string, model: string, mimeType: string, base64: string): Promise<unknown[]> {
  const response = await geminiFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are tracing visible drill routes on a field hockey diagram, including faded monochrome printed pages. Count distinct real arrowheads first. Separate dashed passing paths, solid passing paths and curved/wavy player movements on visual evidence rather than assuming every dashed route means running. Ignore field borders and circle markings. Return lineStyle arc for visibly curved strokes when appropriate. You are tracing ONLY distinct arrows drawn over a field hockey diagram. Return JSON {items:[{type,x,y,x2,y2,strokeColor,dashed,arrowHead,lineStyle}]}. First make an internal stroke inventory: inspect each physically visible BLACK triangular arrowhead, trace BACKWARD through its continuous black ink to the tail, then count UNIQUE traced strokes. Output exactly one stroke for every unique visible arrowhead. When two proposed arrows share the same visible black segment or same physical arrowhead, they are ONE arrow; do not split at an intersecting line, player, cone or field marking. A crossing is not automatically a turn or a new arrow. Never insert a segment between two shirts merely because a pass seems tactically likely. Check your proposed count against the number of individually identifiable arrowheads before returning. Ensure each item has its own physically visible tip. Never duplicate a tip, invent extra arrows, or drop an arrowhead that is clearly present. Use full-image normalized 0..1 coordinates. Output one item per genuine dark/black arrow. Classify each actual arrow by visible evidence: runLine ONLY for a movement/running route shown by a dashed, zigzag, or distinct running-style stroke; passLine for a solid arrow visibly indicating a ball pass; guideLine when the drawing does not establish its meaning. Never call a solid pass line a runLine merely because it points to a player. Never invent missing running lines. Set strokeColor=#111111 for dark drawn arrows, arrowHead=true, lineStyle=straight unless actually curved. Preserve visible dashed style; never infer player movements or fabricate a route when none is drawn. Trace each visible dark arrow independently using only its actual dark stroke pixels. Before returning, verify the tail, arrowhead tip, and black stroke connecting them are all visible in the uploaded image. Do not join two separate arrows into one long line. Follow three-part paths as separate strokes only when separate arrowheads actually exist. Reject any line unsupported by dark pixels. Follow the connected stroke from its tail toward the triangular arrowhead, even if a shirt covers part of it. The source image may have three arrows, but DO NOT assume any count. Do NOT turn a field horizontal line, field boundary, jersey seam or caption into an arrow. Do not reuse the same arrowhead for different strokes. Output the actual tail center x,y and arrow TIP x2,y2, in 0..1 FULL IMAGE coordinates; distinguish arrow lines from white field lines. If an arrow goes from a shirt to another shirt, use the visible black stroke endpoints rather than estimating tactical connections. Locate the center of each arrow tail and precise arrow TIP. Exclude white field boundaries and circles, player shirt seams, and decorative marks. If none visible return items:[]. Do not add players or cones." },
        { role: "user", content: [
          { type: "text", text: "First count black arrowheads, then trace each connected black stroke backwards to its actual tail. Treat crossings as crossings, not endpoints. Return only arrows whose unique physical arrowhead AND continuous stroke you can see. Do not connect players on tactical grounds. Use full-original-image coordinates and preserve direction." },
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



// A blind spot in the first trace can hide a line completely from later
// actor-connection checks. Audit ONLY unaccounted physical arrowheads.
async function auditMissingArrowheads(
  key: string, model: string, mimeType: string, base64: string,
  known: Array<{ x: number; y: number; x2: number; y2: number }>,
): Promise<unknown[]> {
  return []; // Disabled in fast Gemini mode: avoid Edge execution timeout.
  try {
    const response = await geminiFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Audit the uploaded hockey diagram for BLACK triangular arrowheads MISSED by a prior trace. Trace each dark stroke BACKWARDS from its distinct visible tip to its actual tail. Do not assume any number of arrows, player passing sequence or shirt identities. The known arrow coordinates are approximate: compare against physical arrowheads in the picture, never invent an arrow between players, and never duplicate an already represented tip. Inspect particularly whether a diagonal stroke hidden partly behind a shirt has its OWN distinct arrowhead. Ignore white field markings, cones, jersey outlines and intersections without a triangular tip. Return JSON {items:[{type:'passLine'|'runLine'|'guideLine',x,y,x2,y2,strokeColor:'#111111',arrowHead:true,lineStyle:'straight',dashed:false}]}, with FULL original image normalized 0..1 coordinates. Return items:[] if all visible arrowheads are already represented. A solid black arrow is normally passLine, not runLine. No additional explanations." },
          { role: "user", content: [
            { type: "text", text: `Already traced tail/tip positions: ${JSON.stringify(known)}. Find only OTHER clearly visible BLACK arrowheads, each with a separate actual dark line from tail to tip. Do not create arrows based on player locations.` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
          ] },
        ],
      }),
    });
    if (!response.ok) return [];
    const result = await response.json();
    const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}");
    return Array.isArray(parsed.items) ? parsed.items.slice(0, 12) : [];
  } catch { return []; }
}

/**
 * Interpret a line as a relation between two already recognized jerseys.
 * Positions are never inferred or changed by this call; actor IDs refer only
 * to the supplied inventory, so wrong or uncertain IDs simply fall back to
 * the independently traced original stroke.
 */
async function analyzeActorConnections(
  key: string, model: string, mimeType: string, base64: string,
  actors: Array<{ id: number; x: number; y: number; color: string; label: string }>,
  lines: Array<{ id: number; x: number; y: number; x2: number; y2: number; type: string }>,
  mode: "trace" | "verify" = "trace",
): Promise<Array<{ lineId: number; fromActorId: number; toActorId: number; type: string; tail: { x: number; y: number }; tip: { x: number; y: number } }>> {
  return []; // Disabled in fast Gemini mode: avoid Edge execution timeout.
  if (!actors.length || !lines.length) return [];
  try {
    const response = await geminiFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: mode === "verify" ?
            "Independently audit the black arrowheads in this field hockey drawing. Ignore tactics and shirt numbers as routing rules. Identify the genuine physical tail and triangular tip of EACH arrow in source-image normalized coordinates. Black solid arrows connect two jerseys only if both endpoints visually touch or clearly point to them. Do not assume a coach/trainer participates merely because its shirt is near a line. Carefully distinguish the line from the coach to the nearest player from the line between a player and a blue support shirt. For each supplied lineId output the two actor IDs only if the actual stroke can be followed from its tail to its arrowhead. Never invent or connect distant unrelated actors. Return JSON {connections:[{lineId,fromActorId,toActorId,type,tail:{x,y},tip:{x,y}}]} with type passLine or runLine." :
            "You are visually TRACING existing black arrows in a field hockey diagram, NOT inferring tactics. Work in this exact sequence for EACH visually distinct arrow: (1) find the physical black stroke; (2) follow the same connected stroke to its triangular pointed arrowhead; (3) locate the opposite non-pointed tail; (4) write down BOTH pixel positions as normalized FULL-IMAGE coordinates [0,1]; (5) only then identify the shirt at or immediately adjacent to the tail (fromActorId) and the shirt at or immediately adjacent to the tip (toActorId). Never infer sender/receiver from shirt colors, labels, or logical gameplay. Do not confuse field markings, the trainer, cones, or unrelated nearby shirts with arrow endpoints. Numbers on shirts are NOT actor IDs; use supplied IDs. Lines may stop at a shirt's border rather than its center. A stroke going into open space has no receiving actor, so OMIT that relation. For each arrow use its closest supplied rough lineId; approximate line coordinates are noisy hints and must not override visible stroke direction. Output ONLY JSON {connections:[{lineId,fromActorId,toActorId,type,tail:{x,y},tip:{x,y}}]} with type passLine or runLine. Include a relation only if each endpoint and both actor identities are visually supported. Do not invent routes or hardcode a sequence." },
          { role: "user", content: [
            { type: "text", text: `Actors: ${JSON.stringify(actors)}. Rough arrow candidates (not confirmed endpoints): ${JSON.stringify(lines)}. For each candidate, identify the ACTUAL TRIANGULAR ARROWHEAD in the image, not the tail. The direction must point TOWARDS the arrowhead; swapping source and target is incorrect even if it connects the same shirts. Trace each visible black stroke independently, and do not merge separate arrows. Return measured tail/tip in source-image coordinates and their adjacent actor IDs. Preserve the candidate lineId. Never guess from field tactics or shirt numbers.` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
          ] },
        ],
      }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return Array.isArray(parsed.connections) ? parsed.connections : [];
  } catch { return []; }
}

/**
 * Re-read jersey digits using finalized shirt positions. Pixel-centre matching
 * can change a jersey's location without changing the OCR label attached to it.
 * Keep positions immutable: only accept unambiguous, unique digits per team.
 */
async function verifyJerseyNumbers(
  key: string, model: string, mimeType: string, base64: string,
  actors: Array<{ id: number; x: number; y: number; color: string }>,
): Promise<Array<{ id: number; number: string }>> {
  if (!actors.length) return [];
  try {
    const response = await geminiFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature: 0, response_format: { type: "json_object" },
        messages: [
          { role: "system", content:
            "Read ONLY the printed jersey digits in this field hockey diagram. Supplied IDs identify individual shirts by their physical source-image centre; IDs are NOT shirt numbers. For each supplied shirt, look precisely at its location and read the actual visible digit. Never assign sequential numbers, infer tactical numbering, swap shirt coordinates, or guess obscured digits. Blue blank supporting shirts and trainer T have no numeric jersey digit. Return JSON {jerseys:[{id,number}]} for confidently readable single numeric digits only. Omit every uncertain reading." },
          { role: "user", content: [
            { type: "text", text: `Read the digit printed INSIDE each supplied coloured shirt independently at its actual photo coordinates, not by its order in the list: ${JSON.stringify(actors)}. Do not change locations or create players. Respond only with the requested JSON.` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
          ] },
        ],
      }),
    });
    if (!response.ok) return [];
    const result = await response.json();
    const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}");
    return Array.isArray(parsed.jerseys) ? parsed.jerseys : [];
  } catch { return []; }
}

/**
 * Verify ONLY the endpoints of already traced arrows in a second vision pass.
 * A disagreement never moves any physical object and never creates a line.
 */
async function verifyArrowEndpoints(key: string, model: string, mimeType: string,
  base64: string, arrows: Array<Record<string, unknown>>): Promise<unknown[]> {
  return []; // Disabled in fast Gemini mode: avoid Edge execution timeout.
  if (!arrows.length) return [];
  const candidates = arrows.slice(0, 20).map((arrow, i) => ({
    id: i, x: arrow.x, y: arrow.y, x2: arrow.x2, y2: arrow.y2,
  }));
  const response = await geminiFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, temperature: 0, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Independently VERIFY the exact visible tail and arrowhead TIP of each already identified black arrow in a hockey diagram. Return {items:[{id,x,y,x2,y2}]} with original-image normalized coordinates 0..1. ID must be the candidate index. Trace real black ink, not tactical meaning or nearby shirt locations. A tail begins where the actual stroke begins; x2,y2 must be the precise arrowhead TIP. Use the FULL UPLOADED IMAGE (not the cropped field) with origin at top-left and x/y values in 0..1. Verify each arrow separately by tracing its continuous DARK stroke from tail to the triangular arrowhead. Ignore green field boundaries, white pitch markings and shirts. Do not move the start or end onto a jersey, player, cone, or field boundary unless the black stroke literally touches it. Return the original candidate id and source-image coordinates. Preserve candidate direction; when you cannot visually confirm BOTH endpoints return no entry for that id. Do not create or connect strokes not present in the photo." },
        { role: "user", content: [
          { type: "text", text: `Re-check these candidate strokes against the image itself: ${JSON.stringify(candidates)}. Return only independently visible precise endpoints.` },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
        ] },
      ],
    }),
  });
  if (!response.ok) return [];
  const result = await response.json();
  try {
    const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}");
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch { return []; }
}

/**
 * Independently read visible jersey numbers AFTER the geometry pass. This
 * stage is advisory: it must never create a player or move a pixel anchor.
 * A failed audit leaves the original reconstruction intact.
 */
async function analyzeJerseyLabels(key: string, model: string, mimeType: string, base64: string): Promise<unknown[]> {
  return []; // Disabled in fast Gemini mode: avoid Edge execution timeout.
  const response = await geminiFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Inspect ONLY actual field hockey JERSEY icons and the numbers printed INSIDE them. Return JSON {shirts:[{x,y,shirtColor,label}]} where x,y are centers normalized to the ENTIRE ORIGINAL IMAGE. shirtColor must be black, orange, blue, grey, white, red or green. label must be a clearly readable number (1-99) or T; otherwise use an empty string. Do not treat colored circles, arrows, text captions, cones, field markings, or goals as shirts. Do not guess occluded or unclear numbers. Include each real jersey once. Accuracy and faithful spatial locations matter more than producing many results." },
        { role: "user", content: [
          { type: "text", text: "Verify the printed numbers and centers of visible jersey-shaped icons only. Do not infer identities or positions from the drill." },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
        ] },
      ],
    }),
  });
  if (!response.ok) return [];
  const result = await response.json();
  try {
    const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}");
    return Array.isArray(parsed.shirts) ? parsed.shirts.slice(0, 80) : [];
  } catch { return []; }
}

/**
 * Only adopt independently verified labels where both passes agree on the
 * shirt's color and unique nearest location. Never overwrite a conflicting
 * existing label; this prevents second-pass OCR errors from swapping players.
 */
function auditJerseyLabels(items: Array<Record<string, unknown>>, raw: unknown[], calibration: FieldCalibration) {
  const players = items.filter((item) => item.type === "player");
  if (!players.length || !raw.length || raw.length > 80) return items;
  const candidates = raw.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const shirt = value as Record<string, unknown>;
    const shirtColor = String(shirt.shirtColor || "").toLowerCase();
    const label = String(shirt.label ?? "").trim().toUpperCase();
    if (!["black", "orange", "blue", "grey", "white", "red", "green"].includes(shirtColor) ||
      !/^(?:[1-9][0-9]?|T)$/.test(label) ||
      typeof shirt.x !== "number" || typeof shirt.y !== "number" ||
      !Number.isFinite(shirt.x) || !Number.isFinite(shirt.y) ||
      shirt.x < 0 || shirt.x > 1 || shirt.y < 0 || shirt.y > 1) return [];
    return [{ ...calibratedPoint(shirt.x, shirt.y, calibration), shirtColor, label }];
  });
  // Two detections of the same color/number mean the audit cannot uniquely
  // identify that jersey; ignore both rather than risk a swap.
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const key = `${candidate.shirtColor}:${candidate.label}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const proposed = new Map<Record<string, unknown>, string>();
  const used = new Set<Record<string, unknown>>();
  for (const candidate of candidates) {
    if (counts.get(`${candidate.shirtColor}:${candidate.label}`) !== 1) continue;
    const matches = players
      .filter((player) => player.shirtColor === candidate.shirtColor)
      .map((player) => ({ player, distance: Math.hypot(Number(player.x) - candidate.x, Number(player.y) - candidate.y) }))
      .sort((a, b) => a.distance - b.distance);
    if (!matches.length || matches[0].distance > 0.045 ||
      (matches[1] && matches[1].distance - matches[0].distance < 0.025)) continue;
    const player = matches[0].player;
    // A competing audit result too close to this same player is ambiguous.
    const rivals = candidates.filter((other) => other !== candidate &&
      other.shirtColor === candidate.shirtColor &&
      Math.hypot(Number(player.x) - other.x, Number(player.y) - other.y) <= matches[0].distance + 0.012);
    if (rivals.length || used.has(player)) continue;
    const currentLabel = String(player.label || "").trim().toUpperCase();
    if (currentLabel && currentLabel !== candidate.label) continue;
    proposed.set(player, candidate.label);
    used.add(player);
  }
  // Do not introduce duplicate labels within a shirt color.
  for (const [player, label] of proposed) {
    if (players.some((other) => other !== player &&
      other.shirtColor === player.shirtColor &&
      String(other.label || "").trim().toUpperCase() === label)) continue;
    player.label = label;
  }
  return items;
}

function deduplicateDetections(items: Array<Record<string, unknown>>) {
  // Treat adjacent detections of the same shirt as distinct when they have
  // different printed numbers; remove only near-identical duplicates.
  const seen: Array<Record<string, unknown>> = [];
  for (const item of items) {
    const x = Number(item.x), y = Number(item.y);
    const line = lineTypes.has(String(item.type));
    if (seen.some((previous) => {
      if (line !== lineTypes.has(String(previous.type))) return false;
      if (line) {
        return Math.hypot(x - Number(previous.x), y - Number(previous.y)) < 0.018
          && Math.hypot(Number(item.x2) - Number(previous.x2), Number(item.y2) - Number(previous.y2)) < 0.018;
      }
      if (item.type === "text" && previous.type === "text") {
        return String(item.text).trim().toLowerCase() === String(previous.text).trim().toLowerCase()
          && Math.hypot(x - Number(previous.x), y - Number(previous.y)) < 0.075;
      }
      // Overlapping shirt icons can be separate people. Only remove almost
      // identical SAME-identity detections; never dedupe by proximity alone.
      const threshold = item.type === "player" ? 0.007 : 0.018;
      return item.type === previous.type && item.label === previous.label
        && item.shirtColor === previous.shirtColor
        && Math.hypot(x - Number(previous.x), y - Number(previous.y)) < threshold;
    })) continue;
    seen.push(item);
  }
  return seen;
}

// Maintain source-image spatial relationships: only apply narrowly justified
// constraints. In particular, do not force free-form formations into rows.
function applyDiagramConstraints(items: Array<Record<string, unknown>>) {
  const players = items.filter((item) => item.type === "player" || item.type === "trainer");
  const result: Array<Record<string, unknown>> = [];
  for (const item of items) {
    if (item.type === "text") {
      // Labels such as "Steunspeler" should remain beside a visible support
      // player, rather than be placed over the middle of the attacking circle.
      const label = String(item.text ?? "").trim().toLowerCase();
      if (label === "steunspeler" && players.length) {
        const nearest = players
          .filter((player) => player.type === "player" && (player.shirtColor === "blue" || player.shirtColor === "white"))
          .map((player) => ({ player, distance: Math.hypot(Number(player.x) - Number(item.x), Number(player.y) - Number(item.y)) }))
          .sort((a, b) => a.distance - b.distance)[0];
        if (nearest && nearest.distance > 0.18) continue;
      }
    }
    if (lineTypes.has(String(item.type))) {
      const x = Number(item.x), y = Number(item.y);
      const x2 = Number(item.x2), y2 = Number(item.y2);
      // Very short strokes are commonly shirt details or field decorations,
      // not intentional pass/movement arrows.
      if (Math.hypot(x2 - x, y2 - y) < 0.035) continue;
    }
    result.push(item);
  }
  return result;
}


function anchorPixelPlayers(
  items: Array<Record<string, unknown>>,
  pixels: unknown,
  calibration: FieldCalibration,
  jerseyAudit: unknown[] = [],
) {
  if (!Array.isArray(pixels) || pixels.length > 80) return items;
  const candidates = pixels.flatMap((raw: unknown) => {
    if (!raw || typeof raw !== "object") return [];
    const p = raw as Record<string, unknown>;
    const color = String(p.shirtColor);
    if (!["black", "orange", "blue", "grey"].includes(color) ||
      typeof p.x !== "number" || typeof p.y !== "number" ||
      !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
      p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return [];
    return [{ ...calibratedPoint(p.x, p.y, calibration), shirtColor: color }];
  });
  const updated = items.map((item) => ({ ...item }));
  const players = updated.filter((item) => item.type === "player");
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  // Audit-derived labels are only evidence for an EXISTING jersey identity.
  // They must not create, renumber or reposition a player on their own.
  const audited = (Array.isArray(jerseyAudit) ? jerseyAudit : []).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const color = String(r.shirtColor ?? "").toLowerCase();
    const label = String(r.label ?? "").trim().toUpperCase();
    if (!["black", "orange", "blue", "grey"].includes(color) ||
      !/^(?:[1-9][0-9]?|T)$/.test(label) ||
      typeof r.x !== "number" || typeof r.y !== "number" ||
      !Number.isFinite(r.x) || !Number.isFinite(r.y) ||
      r.x < 0 || r.x > 1 || r.y < 0 || r.y > 1) return [];
    return [{ ...calibratedPoint(r.x, r.y, calibration), shirtColor: color, label }];
  });
  // Each numbered jersey must be independently unique in the OCR pass.
  const supportsExtendedSnap = (player: Record<string, unknown>, candidate: Point) => {
    const label = String(player.label ?? "").trim().toUpperCase();
    if (!label) return false;
    const identity = audited.filter((a) =>
      a.shirtColor === player.shirtColor && a.label === label);
    if (identity.length !== 1 || distance(identity[0], candidate) > 0.028) return false;
    // OCR must also agree with the ORIGINAL player position. This avoids
    // using a mistakenly read number to swap two similarly colored jerseys.
    if (distance(identity[0], { x: Number(player.x), y: Number(player.y) }) > 0.075) return false;
    return audited.filter((a) => a.shirtColor === player.shirtColor &&
      distance(a, candidate) <= 0.028).length === 1;
  };
  const used = new Set<number>();
  // Nearest-neighbour in BOTH directions, with a separation margin.
  // Never greedily claim a candidate and shift an adjacent numbered player.
  const claim = (item: Record<string, unknown>, allowed: string[], radius: number) => {
    const origin = { x: Number(item.x), y: Number(item.y) };
    const matching = candidates.map((candidate, index) => ({
      candidate, index, distance: distance(origin, candidate),
    })).filter(({ candidate, distance: d }) => allowed.includes(candidate.shirtColor) && d <= radius)
      .sort((a, b) => a.distance - b.distance);
    if (!matching.length || used.has(matching[0].index)) return null;
    if (matching.length > 1 && matching[1].distance - matching[0].distance < 0.025) return null;
    const closest = matching[0];
    const rivals = players.filter((other) => other !== item &&
      other.shirtColor === closest.candidate.shirtColor)
      .map((other) => distance({ x: Number(other.x), y: Number(other.y) }, closest.candidate));
    if (rivals.some((d) => d <= closest.distance + 0.015)) return null;
    // A pixel component alone is not sufficient evidence for a large move.
    if (closest.distance > 0.035 && !supportsExtendedSnap(item, closest.candidate)) return null;
    return closest;
  };
  // Assign more certain, shorter matches first, independent of source order.
  const ordered = players.map((player) => ({
    player,
    closest: candidates.filter((c) => c.shirtColor === player.shirtColor)
      .reduce((best, c) => Math.min(best,
        distance({ x: Number(player.x), y: Number(player.y) }, c)), Infinity),
  })).sort((a, b) => a.closest - b.closest);
  for (const { player } of ordered) {
    const match = claim(player, [String(player.shirtColor ?? "")], 0.065);
    if (!match) continue;
    player.x = match.candidate.x;
    player.y = match.candidate.y;
    used.add(match.index);
  }
  // Preserve legacy conversion, but only for very close unclaimed candidates.
  for (const item of updated) {
    if (!["attacker", "defender", "trainer"].includes(String(item.type))) continue;
    const allowed = item.type === "trainer" ? ["grey"] :
      item.type === "defender" ? ["black"] : ["blue", "orange"];
    const match = claim(item, allowed, 0.025);
    if (!match) continue;
    const wasTrainer = item.type === "trainer";
    item.type = "player";
    item.shirtColor = match.candidate.shirtColor;
    item.label = wasTrainer ? "T" : typeof item.label === "string" ? item.label : "";
    item.x = match.candidate.x;
    item.y = match.candidate.y;
    used.add(match.index);
  }
  return updated;
}

function anchorSupportLabels(items: Array<Record<string, unknown>>) {
  const blues = items.filter((item) => item.type === "player" && item.shirtColor === "blue");
  const labels = items.filter((item) => item.type === "text" && String(item.text).trim().toLowerCase() === "steunspeler");
  if (!blues.length || !labels.length) return items;
  const assignments = new Map<Record<string, unknown>, Record<string, unknown>>();
  const usedLabels = new Set<Record<string, unknown>>();
  // Anchor each visible support player to at most one source label. Start with
  // the closest label so one annotation never gets reused for both players.
  const pairs = blues.flatMap((player) => labels.map((label) => ({
    player, label,
    distance: Math.hypot(Number(player.x) - Number(label.x), Number(player.y) - Number(label.y)),
  }))).sort((a, b) => a.distance - b.distance);
  for (const { player, label, distance } of pairs) {
    if (distance > 0.17 || assignments.has(player) || usedLabels.has(label)) continue;
    assignments.set(player, label);
    usedLabels.add(label);
  }
  const assigned = new Map(Array.from(assignments.entries()).map(([player, label]) => [label, player]));
  return items.flatMap((item) => {
    if (item.type !== "text" || String(item.text).trim().toLowerCase() !== "steunspeler") return [item];
    const player = assigned.get(item);
    if (!player) return [];
    // Keep the caption under the player without moving the player itself.
    return [{ ...item, x: Math.max(0.1, Math.min(0.9, Number(player.x))),
      y: Math.max(0.05, Math.min(0.94, Number(player.y) + 0.055)) }];
  });
}

function normalizeTrainerObjects(items: Array<Record<string, unknown>>) {
  // The same coach is sometimes detected as a grey jersey and an extra T-circle.
  // Merge only nearby T detections; do not move numbered black/orange players.
  const greys = items.filter((item) => item.type === "player" &&
    item.shirtColor === "grey");
  if (!greys.length) return items;
  const removed = new Set<Record<string, unknown>>();
  const occupied = new Set<Record<string, unknown>>();
  for (const item of items) {
    if (item.type !== "trainer" &&
      !(item.type === "player" && String(item.label).trim().toUpperCase() === "T" && item.shirtColor !== "grey")) continue;
    const nearest = greys.map((grey) => ({
      grey,
      distance: Math.hypot(Number(grey.x) - Number(item.x), Number(grey.y) - Number(item.y)),
    })).sort((a, b) => a.distance - b.distance)
      .find(({ grey }) => !occupied.has(grey));
    if (!nearest || nearest.distance > 0.06) continue;
    if (!String(nearest.grey.label ?? "").trim()) nearest.grey.label = "T";
    occupied.add(nearest.grey);
    removed.add(item);
  }
  return items.filter((item) => !removed.has(item));
}

// Merge the grey and black playing teams only after trainer recognition and
// position/number matching. Keep the trainer's T jersey grey in stored layouts.
function normalizeGreyTeamPlayers(items: Array<Record<string, unknown>>) {
  const normalized = items.map((item) => {
    if (item.type !== "player" || item.shirtColor !== "grey" ||
        String(item.label ?? "").trim().toUpperCase() === "T") return item;
    return { ...item, shirtColor: "black" };
  });
  // Grey and black detections of the same numbered jersey can become identical
  // after normalization. Deduplicate ONLY this cross-color overlap, never
  // distinct numbers, unnumbered nearby shirts, or trainer objects.
  const seen = new Set<number>();
  return normalized.filter((item, index) => {
    if (item.type !== "player" || item.shirtColor !== "black") return true;
    const label = String(item.label ?? "").trim();
    if (!label) return true;
    const duplicate = normalized.findIndex((other, otherIndex) =>
      otherIndex < index && !seen.has(otherIndex) &&
      other.type === "player" && other.shirtColor === "black" &&
      String(other.label ?? "").trim() === label &&
      items[otherIndex].shirtColor !== items[index].shirtColor &&
      Math.hypot(Number(other.x) - Number(item.x), Number(other.y) - Number(item.y)) < 0.018);
    if (duplicate < 0) return true;
    seen.add(index);
    return false;
  });
}

// Recover a missing jersey ONLY when an independent jersey-number pass and
// image pixel detection agree on a unique center. Never infer a team roster,
// create a trainer, or move/overwrite an existing shirt.
function normalizedJerseyColor(value: unknown) {
  const color = String(value ?? "").toLowerCase();
  return color === "grey" ? "black" : color;
}

function recoverVerifiedJerseys(
  items: Array<Record<string, unknown>>,
  rawAudit: unknown[],
  rawPixels: unknown,
  calibration: FieldCalibration,
) {
  if (!Array.isArray(rawPixels) || rawPixels.length > 80 || !Array.isArray(rawAudit)) return items;
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const pixels = rawPixels.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const p = raw as Record<string, unknown>;
    const color = normalizedJerseyColor(p.shirtColor);
    if (!["black", "orange"].includes(color) ||
        typeof p.x !== "number" || typeof p.y !== "number" ||
        !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
        p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return [];
    return [{ ...calibratedPoint(p.x, p.y, calibration), color }];
  });
  const audit = rawAudit.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const p = raw as Record<string, unknown>;
    const color = normalizedJerseyColor(p.shirtColor);
    const label = String(p.label ?? "").trim().toUpperCase();
    if (!["black", "orange"].includes(color) || !/^[1-9][0-9]?$/.test(label) ||
        typeof p.x !== "number" || typeof p.y !== "number" ||
        !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
        p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return [];
    return [{ ...calibratedPoint(p.x, p.y, calibration), color, label }];
  });
  const result = [...items];
  const players = result.filter((item) => item.type === "player");
  const usedPixels = new Set<number>();
  for (const shirt of audit) {
    // Ambiguous repeated OCR identities cannot create extra players.
    if (audit.filter((a) => a.color === shirt.color && a.label === shirt.label).length !== 1) continue;
    if (players.some((p) => normalizedJerseyColor(p.shirtColor) === shirt.color &&
        String(p.label ?? "").trim().toUpperCase() === shirt.label)) continue;
    const candidates = pixels.map((p, index) => ({ ...p, index, distance: distance(p, shirt) }))
      .filter((p) => p.color === shirt.color && p.distance <= 0.04 && !usedPixels.has(p.index))
      .sort((a, b) => a.distance - b.distance);
    if (!candidates.length || (candidates[1] && candidates[1].distance - candidates[0].distance < 0.012)) continue;
    const best = candidates[0];
    // Another OCR identity claiming the same source pixel is ambiguous.
    if (audit.some((a) => a !== shirt && a.color === shirt.color &&
        distance(a, best) <= best.distance + 0.015)) continue;
    // Only reject a physical collision, not simply a nearby different shirt.
    if (players.some((p) => normalizedJerseyColor(p.shirtColor) === shirt.color &&
        String(p.label ?? "").trim().toUpperCase() === shirt.label &&
        distance({ x: Number(p.x), y: Number(p.y) }, best) < 0.022)) continue;
    const recovered: Record<string, unknown> = {
      id: `import-recovered-${items.length + result.length}`,
      type: "player", x: best.x, y: best.y, shirtColor: shirt.color, label: shirt.label,
    };
    result.push(recovered);
    players.push(recovered);
    usedPixels.add(best.index);
  }
  return result;
}

// Recover unlabeled blue support jerseys when their measured pixel center is
// independently near an actual Steunspeler caption. No guessed formations.
function recoverSupportPlayers(
  items: Array<Record<string, unknown>>,
  rawPixels: unknown,
  calibration: FieldCalibration,
) {
  if (!Array.isArray(rawPixels) || rawPixels.length > 80) return items;
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const bluePixels = rawPixels.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const p = raw as Record<string, unknown>;
    if (String(p.shirtColor).toLowerCase() !== "blue" ||
        typeof p.x !== "number" || typeof p.y !== "number" ||
        !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
        p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return [];
    return [calibratedPoint(p.x, p.y, calibration)];
  });
  const result = [...items];
  const players = result.filter((item) => item.type === "player");
  const labels = result.filter((item) => item.type === "text" &&
    String(item.text ?? "").trim().toLowerCase() === "steunspeler");
  const used = new Set<number>();
  for (const label of labels) {
    const position = { x: Number(label.x), y: Number(label.y) };
    // Captions may be offset from an already detected jersey. Never create
    // a second support player just because the pixel detector found a nearby
    // component of that same shirt.
    if (players.some((p) => p.shirtColor === "blue" &&
        distance({ x: Number(p.x), y: Number(p.y) }, position) < 0.12)) continue;
    const nearest = bluePixels.map((pixel, index) => ({ pixel, index, d: distance(pixel, position) }))
      .filter((candidate) => candidate.d <= 0.14 && !used.has(candidate.index))
      .sort((a, b) => a.d - b.d);
    if (!nearest.length || (nearest[1] && nearest[1].d - nearest[0].d < 0.02)) continue;
    const best = nearest[0];
    used.add(best.index);
    if (players.some((p) => p.shirtColor === "blue" &&
        distance({ x: Number(p.x), y: Number(p.y) }, best.pixel) < 0.095)) continue;
    const recovered: Record<string, unknown> = {
      id: `import-support-${items.length + result.length}`,
      type: "player", x: best.pixel.x, y: best.pixel.y, shirtColor: "blue", label: "",
    };
    result.push(recovered);
    players.push(recovered);
  }
  return result;
}

// Experimental cone-style placement: pixel centers are the source of truth
// for existing shirt objects. OCR labels and inventory counts are preserved.
function placePlayersAtPixelCenters(
  items: Array<Record<string, unknown>>,
  rawPixels: unknown,
  calibration: FieldCalibration,
) {
  if (!Array.isArray(rawPixels) || rawPixels.length > 80) return items;
  const pixels = rawPixels.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const p = raw as Record<string, unknown>;
    if (!["black", "grey", "orange", "blue"].includes(String(p.shirtColor)) ||
        typeof p.x !== "number" || typeof p.y !== "number" ||
        !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
        p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return [];
    return [{ ...calibratedPoint(p.x, p.y, calibration),
      color: normalizedJerseyColor(p.shirtColor) }];
  });
  const next = items.map((item) => ({ ...item }));
  const players = next.filter((item) => item.type === "player");
  const used = new Set<number>();
  // Match uniquely nearest same-team centers without swapping adjacent shirts.
  const proposals = players.flatMap((player) => {
    const color = normalizedJerseyColor(player.shirtColor);
    // Do not conflate trainer T with a normal black-team jersey.
    if (String(player.label ?? "").trim().toUpperCase() === "T") return [];
    const alternatives = pixels.map((pixel, index) => ({
      index, pixel, distance: Math.hypot(Number(player.x) - pixel.x, Number(player.y) - pixel.y),
    })).filter((p) => p.pixel.color === color && p.distance < 0.085)
      .sort((a, b) => a.distance - b.distance);
    if (!alternatives.length ||
        (alternatives[1] && alternatives[1].distance - alternatives[0].distance < 0.018)) return [];
    const nearest = alternatives[0];
    const competing = players.some((other) => other !== player &&
      normalizedJerseyColor(other.shirtColor) === color &&
      Math.hypot(Number(other.x) - nearest.pixel.x, Number(other.y) - nearest.pixel.y) < nearest.distance + 0.012);
    return competing ? [] : [{ player, ...nearest }];
  }).sort((a, b) => a.distance - b.distance);
  for (const proposal of proposals) {
    if (used.has(proposal.index)) continue;
    proposal.player.x = proposal.pixel.x;
    proposal.player.y = proposal.pixel.y;
    used.add(proposal.index);
  }
  return next;
}

function filterUnanchoredArrows(items: Array<Record<string, unknown>>) {
  const players = items.filter((item) => item.type === "player" || item.type === "trainer" ||
    item.type === "attacker" || item.type === "defender");
  // Leave images without recognizable players unchanged.
  if (players.length < 2) return items;
  // Arrow tips in the original photo often end just BEFORE a jersey.
  // Allow that small visual gap without inventing arrows: every retained
  // segment still needs a real detected player near BOTH endpoints.
  const nearPlayer = (x: number, y: number) => players.some((player) =>
    Math.hypot(Number(player.x) - x, Number(player.y) - y) < 0.16);
  return items.filter((item) => {
    if (!lineTypes.has(String(item.type))) return true;
    const x = Number(item.x), y = Number(item.y), x2 = Number(item.x2), y2 = Number(item.y2);
    if (![x, y, x2, y2].every(Number.isFinite)) return false;
    // The arrows in hockey drills run between player locations. Reject
    // speculative lines floating across field markings or the shooting circle.
    return nearPlayer(x, y) && nearPlayer(x2, y2);
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
    const key = Deno.env.get("GEMINI_API_KEY");
    // Report missing variable *names* only; never expose secret values.
    const missing = [
      !url ? "SUPABASE_URL" : null,
      !anon ? "SUPABASE_ANON_KEY" : null,
      !key ? "GEMINI_API_KEY" : null,
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

    const visionModel = Deno.env.get("GEMINI_EXERCISE_VISION_MODEL") || "gemini-3.8-flash";
    const response = await geminiFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Use a full vision-capable model for pixel-position analysis; configurable for budgets.
        model: visionModel,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `You are an accurate field hockey exercise diagram TRACER, not a diagram designer. Return one JSON object: title, subtitle, explanation, instructions, calibration, items. TITLE QUALITY: Write the title in Dutch using roughly 4-9 natural words that identify THIS drill by its visible hockey action, movement pattern or training goal. Use only details visible in the image or its exercise text. Treat printed names such as "Vereenvoudigde passoefening 9", "Oefening 4" or "Passoefening" as generic source labels; do not copy them or append sequence numbers. Prefer concrete informative titles such as "Passen en doorbewegen in een driehoek" ONLY when that formation truly appears. Do not hallucinate formations, rules, skills or equipment.

GEOMETRY FIRST: calibration={bounds:{left,top,right,bottom},goalEdge,rotation,flipHorizontal,corners?}. corners is OPTIONAL and must be {tl:{x,y},tr:{x,y},br:{x,y},bl:{x,y}} in full ORIGINAL image coordinates, where tl/tr/br/bl are the four corners of the same visible hockey field rectangle in image orientation. Return corners ONLY when all four edges/corners are clearly visible and confidently identified; do not hallucinate corners outside the image. The server will use the four corners for mild perspective/skew compensation and otherwise fall back to bounds. All numbers are fractions of the FULL uploaded image [0,1]. Find the top, right, bottom, left borders of the ACTUAL EXERCISE DIAGRAM. For a photographed coaching-book page, the exercise diagram may be a smaller printed rectangle INSIDE a page containing a title, instructions, numbered paragraphs or other illustrations. Crop tightly to that small diagram rectangle: exclude ALL page headers, paragraphs, page margins, book edges and paper background. Do NOT treat the outer boundary of the photographed book page as a playing field. For full-frame digital green-field diagrams, use the green field boundary instead. Return bounds in normalized ORIGINAL PHOTO coordinates, not coordinates relative to the book diagram. When a clearly bounded printed drill diagram exists, choose that rectangle even if it has white paper instead of green turf. Do not enlarge it to include textual coaching instructions. Only fall back to bounds={left:0,top:0,right:1,bottom:1} when no confidently identifiable exercise diagram rectangle exists. goalEdge must be top/right/bottom/left ONLY when an actual rectangular goal and/or solid shooting circle visibly indicates the attacking end; otherwise unknown. In particular, if the goal is physically at the TOP of the image, goalEdge MUST be "top" even when the picture is taller than wide. rotation is informational; the server computes rotation from goalEdge. Do not mirror by default: flipHorizontal=false except when unmistakably necessary.

TRACE BEFORE INTERPRETING: Study every individual object in source-image coordinates. Return only clearly drawn object centers, one JSON item per object, in the ORIGINAL image frame, NOT cropped, rotated, or moved. No rearrangement, equal spacing, inferred missing teammates, or tidy symmetrical formations. A player jersey icon is ONE player, not a cone; a numbered black jersey is still ONE player. Cones are the small triangular/tall traffic-cone icons; plain little white dots along a hockey field line are PRINTED FIELD MARKINGS and must NOT become balls. For every distinct JERSEY use type="player" and return shirtColor (black,orange,blue,grey,white,red,green) and label (visible jersey number or T; empty if none). Preserve shirt COLOR and NUMBERS literally; never convert shirt icons to attacker or defender circles. Preserve text as separate type="text" item with text exactly as printed (e.g. Steunspeler) and its center coordinates. Orange jerseys are player items, never cones. Keep all visible player positions even if colors repeat; never invent defensive formations, lines or extra objects. All coaching equipment that marks a location is a cone in this app: tall traffic cones, flat disc markers, hats, small triangular pylons, numbered training markers, faint grey/black cone pictograms and marker stacks MUST be separate type="cone" objects at their actual centres. Never output hat/marker/disc for them. A small player pictogram or numbered player symbol is NEVER a cone. When a combined label "1/2" or "1./2." visibly indicates a shared player starting position, it means TWO players (shirts numbered 1 and 2) side by side at that single station, not a fractional number; do not confuse this with a sequence number or cone label. When a number (1, 2, 3, "1.", "2.") denotes a player position, return type="player", label="1"/"2", shirtColor="black" for monochrome source, at the actual player-symbol centre, not text. A number by itself is not sufficient: exercise-step numbers, repeated phase numbers, distance numbers and numbered cone annotations remain text/annotations and must NOT fabricate a player. For numerical text, use visual evidence to distinguish players from exercise steps, numbered cones, distances and legends. For each numeric text candidate include role ("player", "step", "distance", "cone" or "unknown") and visualType ("shirt", "player", "circle", "cone", "plainText" or "unknown") when actually supported by its icon and surroundings. Only when there is strong visual evidence that the numeral represents a player, set representsPlayer=true and role="player"; otherwise leave it as text. Do not claim visual evidence when there is only a digit. Keep numbered players separate even if the same number is repeated in the source at different actual positions. Only output a separate "ball" if a distinct ball icon is clearly visible.



PRINTED COACHING-BOOK DIAGRAMS: The source may be a photographed, faded, grey, monochrome or low-contrast training page, not a green computer diagram. Recognize the actual printed drill marks, not only black pixels. Distinguish these visually: solid straight passes, dashed passes, solid movement arrows, curved/wavy running routes, and field markings. Differentiate passLine/runLine by the shown hockey action and visual notation, not just solid vs dashed. A wavy or winding route should be runLine even if solid. A dashed straight player-to-player stroke can be passLine when the graphic uses dashed lines for passing. Do not confuse semicircles, dashed shooting-circle boundaries, horizontal halfway lines, numbers, printed text, or crop borders with exercise arrows. For curved paths, retain true start/tip, type runLine with lineStyle arc when available (do not straighten their endpoints based on tactical guesses). Ignore green field background as an object. Treat tiny black-and-white pawn/ball symbols, tiny numbered cones and discs at their measured centres, without inventing shirts where the photo shows none. Use the existing app object shapes and colours: for shirts only use actual confidently visible shirt colours; greyscale print is NOT evidence of a black or orange jersey. If the source has no coloured shirts, identify individual player/actor markers conservatively rather than making up two teams. For lines return their geometry and style, but canvas colours come from the app (not the photograph).

LINE TRACING: For every visible black arrow, create exactly one line item with strokeColor="#111111", dashed=false, arrowHead=true; with its original x,y start and x2,y2 end at the actual arrow tip. Type passLine for a ball pass and runLine for a player movement when obvious; default guideLine if unclear. Do NOT turn white field markings/circles into exercise lines. Keep original directions. Every line endpoint uses normalized FULL image coordinates. Never add speculative arrows.

JSON items: {type,x,y,x2?,y2?,lineStyle?,color?,rotation?,shirtColor?,label?,text?,representsPlayer?,role?,strokeColor?,dashed?,arrowHead?}. Types: cone,hat,attacker,defender,trainer,ball,goal,runLine,passLine,guideLine,player,text. Lines require x2,y2, optional lineStyle straight/zigzag/arc/bounce/passeer. Hats may have color white/orange/yellow/red/blue/green. Output object centers and line endpoints with THREE decimal places. Be meticulous with geometry and count; do not create approximate diagrams from a verbal interpretation. Write description fields in Dutch, never reproduce personal/contact information. If not a diagram, items=[].` },
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
        message = "De Gemini API-sleutel is ongeldig. Controleer GEMINI_API_KEY in Supabase Secrets.";
      } else if (providerCode === "insufficient_quota") {
        message = "Het Gemini API-account heeft onvoldoende API-tegoed. Controleer Billing en Usage op aistudio.google.com.";
      } else if (response.status === 429) {
        message = "Gemini heeft een gebruikslimiet bereikt. Controleer API-tegoed en limieten of probeer later opnieuw.";
      } else if (response.status === 403) {
        message = "Het Gemini-project heeft geen toegang tot deze AI-aanvraag. Controleer de projectrechten.";
      } else if (response.status === 400 || response.status === 404) {
        message = "Gemini accepteert deze afbeelding of dit model niet. Controleer het AI-model en probeer een andere foto.";
      }
      return json({ error: message, provider_status: response.status, provider_code: providerCode || null }, 502);
    }
    const result = await response.json();
    const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}");
    const calibration = parseCalibration(parsed.calibration);
    // Keep expensive Gemini image passes bounded: the former implementation
    // made many consecutive full-image calls and could exceed the Edge limit (HTTP 546).
    // Use the primary analysis for inventory and a single focused arrow pass.
    // Optional jersey/arrow audits below remain empty and cannot trigger extra calls.
    const jerseyAudit: unknown[] = [];
    let arrowItems: unknown[] = [];
    // The initial Gemini pass already identifies arrows. Avoid re-uploading and
    // reanalysing the entire photograph if it returned drawable arrow strokes.
    // A second full-image request can exceed the HTTP gateway timeout (504).
    const primaryArrows = Array.isArray(parsed.items)
      ? parsed.items.filter((item: unknown) => item && typeof item === "object" &&
          lineTypes.has(String((item as Record<string, unknown>).type)) &&
          ["x", "y", "x2", "y2"].every((key) =>
            Number.isFinite(Number((item as Record<string, unknown>)[key]))))
      : [];
    if (primaryArrows.length === 0) {
      try {
        arrowItems = await analyzeArrows(key!, visionModel, mimeType, base64);
      } catch {
        // The primary result remains valid even if the optional recovery fails.
      }
    }
    const inventoryItems: unknown[] | null = null;
    // The image is the single source of truth. Detect objects in ORIGINAL full-image
    // normalized coordinates, then apply the same calibrated mapping ONCE to every
    // player, cone, ball, caption and both endpoints of every arrow.
    // Do not substitute a second pixel-detection roster, snap to other objects,
    // infer missing team members or tactically rearrange anything.
    const sourceVisualItems: unknown[] = (inventoryItems?.length
      ? inventoryItems : Array.isArray(parsed.items) ? parsed.items : [])
      .map(normalizePrintedEquipment).filter((item) => item !== null) as Record<string, unknown>[];
    const promoted = promotePrintedPlayers(sourceVisualItems as Record<string, unknown>[]);
    sourceVisualItems.splice(0, sourceVisualItems.length, ...promoted);
    // One targeted bounded scan cross-checks both printed player symbols and
    // cones, even if Gemini's primary inventory found only some markers.
    const specialist = await recoverPrintedCones(key!, visionModel, mimeType, base64);
    const sourceDistance = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      Math.hypot(Number(a.x)-Number(b.x), Number(a.y)-Number(b.y));
    const photoObjects = sourceVisualItems as Record<string, unknown>[];
    for (const candidate of specialist.numberedPlayers) {
      const number = String(candidate.label);
      const nearby = photoObjects.filter(obj => sourceDistance(obj, candidate) < 0.11);
      const matchingText = nearby
        .filter(obj => obj.type === "text" &&
          /^([1-9][0-9]?)\.?$/.exec(String(obj.text ?? "").trim())?.[1] === number)
        .sort((a,b) => sourceDistance(a,candidate)-sourceDistance(b,candidate));
      const existing = nearby.filter(obj => obj.type === "player" &&
        sourceDistance(obj,candidate) < 0.045)
        .sort((a,b) => sourceDistance(a,candidate)-sourceDistance(b,candidate))[0];
      if (existing) {
        // Don't overwrite a different printed number or create overlapping shirts.
        if (String(existing.label ?? "").trim() &&
            String(existing.label).trim() !== number) continue;
        if (!String(existing.label ?? "").trim()) existing.label = number;
        // Remove only the label immediately corresponding to the same symbol.
        if (matchingText.length === 1 && sourceDistance(matchingText[0],candidate) < 0.055)
          photoObjects.splice(photoObjects.indexOf(matchingText[0]), 1);
        continue;
      }
      // Two independent Gemini passes must agree on both identity and area.
      // Nearby cones are expected in hockey diagrams: block only when the
      // specialist player icon is practically centered on a cone or another
      // actor, not simply because a pylon is within the same drill station.
      const nearbyEquipment = photoObjects.some(obj =>
        ["cone","trainer","attacker","defender"].includes(String(obj.type)) &&
        sourceDistance(obj,candidate) < 0.012);
      if (matchingText.length !== 1 ||
          sourceDistance(matchingText[0],candidate) > 0.075 ||
          nearbyEquipment) continue;
      photoObjects.splice(photoObjects.indexOf(matchingText[0]), 1);
      photoObjects.push(candidate);
    }
    // Do NOT replace the cone inventory with the red pixel mask: that mask
    // cannot see black, grey or flat markers in scanned coaching books.
    // Do not let an object outside the calibrated photo crop collapse to
    // the top/left canvas border. The coordinate clamp in calibratedPoint
    // is appropriate for drawing, but not evidence that a cone exists.
    const insideFieldCrop = (obj: Record<string, unknown>) => {
      const x = Number(obj.x), y = Number(obj.y);
      const { left, right, top, bottom } = calibration.bounds;
      const margin = 0.008;
      return Number.isFinite(x) && Number.isFinite(y) &&
        x >= left - margin && x <= right + margin &&
        y >= top - margin && y <= bottom + margin;
    };
    for (let i = photoObjects.length - 1; i >= 0; i--) {
      if (photoObjects[i].type === "cone" && !insideFieldCrop(photoObjects[i])) {
        photoObjects.splice(i, 1);
      }
    }
    const primaryCones = photoObjects.filter(obj => obj.type === "cone");
    const usedPrimary = new Set<Record<string, unknown>>();
    for (const candidate of specialist.cones) {
      if (!insideFieldCrop(candidate)) continue;
      const ranked = primaryCones.filter(obj => !usedPrimary.has(obj))
        .map(obj => ({obj,d:sourceDistance(obj,candidate)})).sort((a,b)=>a.d-b.d);
      const best = ranked[0];
      // Reconcile matching detections conservatively. The specialized reading
      // can correct small offsets only with a unique local correspondence.
      if (best && best.d < 0.075 && (!ranked[1] || ranked[1].d-best.d > 0.023)) {
        usedPrimary.add(best.obj);
        if (best.d <= 0.05) { best.obj.x = candidate.x; best.obj.y = candidate.y; }
        continue;
      }
      if (primaryCones.some(obj => sourceDistance(obj,candidate) < 0.075) ||
          photoObjects.some(obj => ["player","trainer","attacker","defender"].includes(String(obj.type)) &&
            sourceDistance(obj,candidate) < 0.025) ||
          photoObjects.some(obj => obj.type === "cone" && sourceDistance(obj,candidate) < 0.025)) continue;
      // Specialist-only findings must have independent pixel evidence.
      // Otherwise a hallucinated marker can appear as an extra cone near
      // the upper-left corner. Keep the primary Gemini inventory as-is;
      // this check applies only to NEW specialist additions.
      const confirmedByPixels = Array.isArray(body?.detectedCones) &&
        body.detectedCones.some((raw: unknown) => {
          if (!raw || typeof raw !== "object") return false;
          const anchor = raw as Record<string, unknown>;
          const ax = Number(anchor.x), ay = Number(anchor.y);
          return Number.isFinite(ax) && Number.isFinite(ay) &&
            Math.hypot(ax - Number(candidate.x), ay - Number(candidate.y)) < 0.028;
        });
      if (!confirmedByPixels) continue;
      photoObjects.push(candidate);
      primaryCones.push(candidate);
      usedPrimary.add(candidate);
    }
    // A printed 1/2 or 1./2. marks TWO players at EACH starting station.
    // Gemini may already have placed shirt 1 there, so complete the pair
    // rather than discarding the label when a nearby player exists.
    const pairLabel = (value: unknown) =>
      /^1\.?\s*\/\s*2\.?$/.test(String(value ?? "").trim());
    const pairMarkers = photoObjects.filter(obj =>
      (obj.type === "player" && pairLabel(obj.label)) ||
      (obj.type === "text" && pairLabel(obj.text ?? obj.label)));
    for (const marker of pairMarkers) {
      const x = Number(marker.x), y = Number(marker.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const context = [marker.role, marker.visualType, marker.description]
        .map(value => String(value ?? "").toLowerCase()).join(" ");
      const evidence = marker.type === "player" || marker.representsPlayer === true ||
        /speler|player|shirt|jersey|startpositie/.test(context) ||
        photoObjects.some(obj => lineTypes.has(String(obj.type)) &&
          (Math.hypot(Number(obj.x)-x, Number(obj.y)-y) < 0.075 ||
           Math.hypot(Number(obj.x2)-x, Number(obj.y2)-y) < 0.075));
      if (!evidence) continue;
      const nearby = photoObjects.filter(obj => obj !== marker && obj.type === "player" &&
        Math.hypot(Number(obj.x)-x, Number(obj.y)-y) < 0.035);
      // Treat existing single shirts as members of this pair, not an excuse
      // to skip processing; never introduce duplicate labels at the station.
      const players = marker.type === "player" ? [marker, ...nearby] : nearby;
      const color = String(players[0]?.shirtColor ?? marker.shirtColor ?? "black");
      const centerOffset = 0.018;
      const makePlayer = (label: string, offset: number): Record<string, unknown> => ({
        type: "player", label, shirtColor: color,
        x: Math.max(0.01, Math.min(0.99, x + offset)), y,
      });
      const existingOne = players.find(player => String(player.label) === "1");
      const existingTwo = players.find(player => String(player.label) === "2");
      const combined = players.find(player => pairLabel(player.label));
      const targetOne = existingOne ?? combined ?? (players.find(player => !String(player.label ?? "").trim()));
      if (targetOne) Object.assign(targetOne, {label: "1", x: Math.max(0.01, x-centerOffset), y});
      else photoObjects.push(makePlayer("1", -centerOffset));
      if (existingTwo) Object.assign(existingTwo, {x: Math.min(0.99, x+centerOffset), y});
      else photoObjects.push(makePlayer("2", centerOffset));
      if (marker.type === "text") {
        const index = photoObjects.indexOf(marker);
        if (index >= 0) photoObjects.splice(index, 1);
      }
    }
    // "Steunspeler" is a caption beside a blue shirt, NOT a separate board
    // object. Shirt numbers remain on the shirt. Keep unrelated drill text.
    const physicalSource = sourceVisualItems.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const entry = item as Record<string, unknown>;
      if (lineTypes.has(String(entry.type))) return false;
      return !(entry.type === "text" &&
        String(entry.text ?? "").trim().toLowerCase().replace(/\\s+/g, " ") === "steunspeler");
    });
    // The vision API occasionally returns percentage coordinates (0..100)
    // although normalized 0..1 was requested. Without this conversion the
    // shared canvas calibration clamps BOTH endpoints to the same edge, so
    // the UI counts an arrow but can only draw an invisible dot.
    // Never alter player, cone or other object coordinates here.
    const normalizeArrowCoordinates = (raw: unknown): Record<string, unknown> | null => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Record<string, unknown>;
      const values = [item.x, item.y, item.x2, item.y2].map(Number);
      if (!values.every(Number.isFinite) || values.some(v => v < 0 || v > 100)) return null;
      // 0..1 is preferred. Treat values above 1 as percentages only if
      // the complete coordinate tuple can represent that range.
      const scale = values.some(v => v > 1) ? 0.01 : 1;
      const [x, y, x2, y2] = values.map(v => v * scale);
      if ([x,y,x2,y2].some(v => v < 0 || v > 1)) return null;
      const start = calibratedPoint(x, y, calibration);
      const end = calibratedPoint(x2, y2, calibration);
      if (Math.hypot(start.x - end.x, start.y - end.y) < 0.018) return null;
      return { ...item, x, y, x2, y2 };
    };
    const focusedNormalized = arrowItems.map(normalizeArrowCoordinates).filter(
      (item): item is Record<string, unknown> => item !== null);
    const genericNormalized = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((item: Record<string, unknown>) => lineTypes.has(String(item?.type)))
      .map(normalizeArrowCoordinates).filter(
        (item): item is Record<string, unknown> => item !== null);
    // Focused arrow tracing takes priority; never merge unrelated candidate
    // lines from the general drill description into the same pass layer.
    // A dedicated arrow pass is more trustworthy than tactical inference
    // in the general exercise description. Never supplement it with imagined
    // general-pass arrows when dedicated analysis returned usable strokes.
    // Independent arrow layer; never modify player or support-player coordinates.
    // Reconcile distinct independently traced strokes with the general
    // detection pass. A valid focused line must never suppress ANOTHER clearly
    // separate line visible in the general result. Never infer missing arrows
    // from a known team formation or from player positions.
    // Do not union two independent vision interpretations. They can describe
    // the SAME ink stroke using substantially different endpoints, resulting
    // in double counted or entirely fabricated arrows. Trust the dedicated
    // stroke-tracing pass when it sees any drawable lines; the general pass
    // is a fallback ONLY when the dedicated pass has no valid strokes.
    // Neither source is allowed to infer extra arrows from player formation.
    // Dedicated arrow tracing is independent of the physical-object layers.
    // Reject near-identical arrowheads to avoid drawing the same ink twice.
    const focusedUnique: Record<string, unknown>[] = [];
    for (const candidate of focusedNormalized) {
      const duplicateTip = focusedUnique.some(other =>
        Math.hypot(Number(other.x2) - Number(candidate.x2),
                   Number(other.y2) - Number(candidate.y2)) < 0.028);
      if (!duplicateTip) focusedUnique.push(candidate);
    }
    // A general-purpose recognition pass may re-describe the SAME ink with
    // different geometry. Do not merge its speculative arrows into the
    // dedicated trace: this previously turned three drawn arrows into four.
    const rawArrows = [...(focusedUnique.length ? focusedUnique : genericNormalized)];
    // Recover a single omitted stroke only when a second reading sees exactly
    // ONE more arrow. Never bulk-union the readings: that introduced fake lines.
    // Both endpoints must be close to DIFFERENT existing non-trainer jerseys,
    // and a separate visual audit must verify the same directed ink stroke.
    if (focusedUnique.length && genericNormalized.length === focusedUnique.length + 1) {
      const shirts = physicalSource.flatMap((raw) => {
        const actor = raw as Record<string, unknown>;
        if (!["player", "attacker", "defender"].includes(String(actor.type)) ||
            String(actor.label ?? "").trim().toUpperCase() === "T") return [];
        const x = Number(actor.x), y = Number(actor.y);
        return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
      });
      const distance = (a: {x:number;y:number}, b: {x:number;y:number}) =>
        Math.hypot(a.x - b.x, a.y - b.y);
      const ends = (line: Record<string, unknown>) => [
        {x:Number(line.x),y:Number(line.y)}, {x:Number(line.x2),y:Number(line.y2)},
      ];
      const sameInk = (a: Record<string, unknown>, b: Record<string, unknown>) => {
        const [a0,a1]=ends(a), [b0,b1]=ends(b);
        return (distance(a0,b0)<0.075 && distance(a1,b1)<0.075) ||
          (distance(a0,b1)<0.075 && distance(a1,b0)<0.075);
      };
      const possible = genericNormalized.filter(line => {
        if (focusedUnique.some(existing => sameInk(line, existing))) return false;
        const [tail, tip] = ends(line);
        const nearest = (point:{x:number;y:number}) => shirts
          .map((shirt,i)=>({i,d:distance(point,shirt)}))
          .sort((a,b)=>a.d-b.d)[0];
        const from=nearest(tail), to=nearest(tip);
        return from && to && from.i !== to.i && from.d < 0.085 && to.d < 0.085;
      });
      if (possible.length === 1) {
        try {
          const audit = await verifyArrowEndpoints(key!, visionModel, mimeType, base64, possible);
          const result = audit.length === 1 ? audit[0] as Record<string, unknown> : null;
          const checked = result && Number(result.id) === 0 ? normalizeArrowCoordinates(result) : null;
          if (checked) {
            const [a0,a1]=ends(possible[0]), [b0,b1]=ends(checked);
            const ux=a1.x-a0.x, uy=a1.y-a0.y, vx=b1.x-b0.x, vy=b1.y-b0.y;
            const cosine=(ux*vx+uy*vy)/(Math.max(0.00001,Math.hypot(ux,uy)*Math.hypot(vx,vy)));
            if (distance(a0,b0)<0.045 && distance(a1,b1)<0.045 && cosine>0.95 &&
                !focusedUnique.some(existing=>sameInk(existing,checked))) {
              rawArrows.push(checked);
            }
          }
        } catch { /* An uncertain third arrow is better omitted than invented. */ }
      }
    }
    // Independently look for physical arrowheads not included in the first
    // inventory. Nothing is added on model assertion alone: an independent
    // image audit must confirm the SAME tail, tip and direction. This only
    // adds to the arrow layer; actor positions remain completely unchanged.
    if (focusedUnique.length) {
      const pointDistance = (x: Record<string, unknown>, y: Record<string, unknown>, end: boolean) =>
        Math.hypot(Number(end ? x.x2 : x.x) - Number(end ? y.x2 : y.x),
                   Number(end ? x.y2 : x.y) - Number(end ? y.y2 : y.y));
      try {
        const missing = (await auditMissingArrowheads(key!, visionModel, mimeType, base64,
          rawArrows.map(a => ({ x: Number(a.x), y: Number(a.y),
            x2: Number(a.x2), y2: Number(a.y2) }))))
          .map(normalizeArrowCoordinates).filter(
            (a): a is Record<string, unknown> => a !== null);
        // One physical arrowhead corresponds to one stroke. Do not supplement
        // a line whose end is already represented, even with a different tail.
        const uniqueMissing = missing.filter((candidate, i) =>
          !missing.slice(0, i).some(other => pointDistance(candidate, other, true) < 0.035) &&
          !rawArrows.some(other => pointDistance(candidate, other, true) < 0.035));
        if (uniqueMissing.length) {
          const independentlyChecked = await verifyArrowEndpoints(
            key!, visionModel, mimeType, base64, uniqueMissing);
          for (const checkedRaw of independentlyChecked) {
            const checked = checkedRaw as Record<string, unknown>;
            const index = Number(checked.id);
            if (!Number.isInteger(index) || index < 0 || index >= uniqueMissing.length) continue;
            const candidate = uniqueMissing[index];
            const validated = normalizeArrowCoordinates(checked);
            if (!validated || pointDistance(candidate, validated, false) > 0.035 ||
                pointDistance(candidate, validated, true) > 0.035 ||
                rawArrows.some(other => pointDistance(other, validated, true) < 0.035))
              continue;
            const dx = Number(candidate.x2) - Number(candidate.x);
            const dy = Number(candidate.y2) - Number(candidate.y);
            const vx = Number(validated.x2) - Number(validated.x);
            const vy = Number(validated.y2) - Number(validated.y);
            if ((dx * vx + dy * vy) / Math.max(0.000001,
                Math.hypot(dx, dy) * Math.hypot(vx, vy)) < 0.95) continue;
            rawArrows.push({ ...candidate, type: candidate.type === "runLine" &&
              candidate.dashed === true ? "runLine" : "passLine" });
          }
        }
      } catch { /* Do not add uncertain or unverified strokes. */ }
    }
    // Verify end points without ever touching the seven other independent
    // object layers. Reject large or reversed corrections as uncertain.
    let endpointChecks: unknown[] = [];
    try {
      endpointChecks = await verifyArrowEndpoints(key!, visionModel, mimeType, base64, rawArrows);
    } catch { /* Keep original arrows when verification is unavailable. */ }
    let verifiedEndpoints = 0;
    const candidateArrows = rawArrows.map((item, i) => {
      const matches = endpointChecks.filter((v) => v && typeof v === "object" &&
        Number((v as Record<string, unknown>).id) === i);
      if (matches.length !== 1) return item;
      const normalized = normalizeArrowCoordinates(matches[0]);
      if (!normalized) return item;
      const oldStart = { x: Number(item.x), y: Number(item.y) };
      const oldTip = { x: Number(item.x2), y: Number(item.y2) };
      const newStart = { x: Number(normalized.x), y: Number(normalized.y) };
      const newTip = { x: Number(normalized.x2), y: Number(normalized.y2) };
      // Do not accept a line whose two ends have been swapped, or whose
      // geometry points in a substantially different direction.
      const ux = oldTip.x - oldStart.x, uy = oldTip.y - oldStart.y;
      const vx = newTip.x - newStart.x, vy = newTip.y - newStart.y;
      const cosine = (ux * vx + uy * vy) /
        Math.max(0.00001, Math.hypot(ux, uy) * Math.hypot(vx, vy));
      if (cosine < 0.85) return item;
      // The independent verification can adjust each endpoint separately.
      // Prior behavior rejected an entire correction when just one endpoint
      // differed, leaving BOTH points wrong. Large jumps remain forbidden.
      const startDelta = Math.hypot(newStart.x - oldStart.x, newStart.y - oldStart.y);
      const tipDelta = Math.hypot(newTip.x - oldTip.x, newTip.y - oldTip.y);
      const startOk = startDelta <= 0.12;
      const tipOk = tipDelta <= 0.12;
      if (!startOk && !tipOk) return item;
      const next = {
        ...item,
        x: startOk ? newStart.x : oldStart.x,
        y: startOk ? newStart.y : oldStart.y,
        x2: tipOk ? newTip.x : oldTip.x,
        y2: tipOk ? newTip.y : oldTip.y,
      };
      if (!normalizeArrowCoordinates(next)) return item;
      verifiedEndpoints += Number(startOk) + Number(tipOk);
      return next;
    });
    // Keep pass routes, running routes and genuinely ambiguous guides separate.
    // Do not snap endpoints to players or change the route semantics.
    const sourceArrows = candidateArrows.map((value) => {
      const arrow = value as Record<string, unknown>;
      if (!arrow || !lineTypes.has(String(arrow.type))) return value;
      // Classify the VISUAL stroke, independently of its sender/receiver.
      // Vision sometimes calls a solid straight pass an explicit runLine;
      // previously we corrected only guideLine, so the false runLine survived.
      // A genuinely dashed or zigzag running path retains its original type.
      const style = String(arrow.lineStyle ?? "straight").toLowerCase();
      const isMovementStyle = arrow.dashed === true ||
        style === "zigzag" || style === "bounce";
      const isSolidArrow = !isMovementStyle && arrow.arrowHead !== false &&
        (arrow.type === "guideLine" || arrow.type === "runLine");
      const type = isSolidArrow ? "passLine" : arrow.type;
      // Do not use the ink colour of a photographed/paper drill as the canvas colour.
      // The same defaults used by manually drawn app lines live in ExerciseBoardCanvas:
      // passLine #6EC6FF, runLine #FFD166, guideLine #B8C7D9.
      // Source hue is evidence for tracing only; imported elements use app styling.
      const appStroke = type === "runLine" ? "#FFD166" :
        type === "passLine" ? "#6EC6FF" : "#B8C7D9";
      return { ...arrow, type, strokeColor: appStroke, dashed: arrow.dashed === true,
        arrowHead: arrow.arrowHead !== false,
        lineStyle: typeof arrow.lineStyle === "string" ? arrow.lineStyle : "straight" };
    });

    // Image-pixel centers can correct approximate AI geometry, but must NEVER
    // change the inventory count, identity or color. Match in ORIGINAL image
    // coordinates before applying the ONE shared field transform.
    type PixelAnchor = { x: number; y: number; shirtColor?: string };
    const validAnchors = (raw: unknown): PixelAnchor[] =>
      Array.isArray(raw) && raw.length <= 120 ? raw.flatMap((v) => {
        if (!v || typeof v !== "object") return [];
        const p = v as Record<string, unknown>;
        return typeof p.x === "number" && typeof p.y === "number" &&
          p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
          ? [{ x: p.x, y: p.y, shirtColor: String(p.shirtColor ?? "") }] : [];
      }) : [];
    const coneAnchors = validAnchors(body?.detectedCones);
    const playerAnchors = validAnchors(body?.detectedPlayers);
    // Assign measured centers only when the per-color detection is complete.
    // A one-to-one match is not enough on its own: require a unique nearby
    // source object so two adjacent numbered shirts are never exchanged.
    // The AI sometimes invents visually tidy rows even if it counts all shirts.
    // When the image pixel detector sees precisely the same color inventory,
    // measured source-image positions MUST replace the AI positions, including
    // for large displacements. The AI only supplies the shirt identity/number.
    // Assign labels to pixels using a minimum-distance bijection (not greedy
    // snapping), leaving the player count and shirt colors unchanged.
    const anchorObjects = (values: unknown[], type: string, anchors: PixelAnchor[]) => {
      const updated = [...values];
      if (type !== "player" || !anchors.length) return updated;
      const groups = ["orange", "black", "grey", "blue", "white", "red", "green"];
      for (const color of groups) {
        const entries = values.flatMap((raw, index) => {
          const item = raw as Record<string, unknown>;
          if (item?.type !== "player" ||
              (color === "black"
                ? !["black", "grey"].includes(String(item.shirtColor).toLowerCase())
                : String(item.shirtColor).toLowerCase() !== color) ||
              !Number.isFinite(Number(item.x)) || !Number.isFinite(Number(item.y))) return [];
          return [{ index, item }];
        });
        // Black and grey playing shirts are the same visual team in this
        // editor. The pixel detector may classify black outlines as grey,
        // while vision inventories them as black. Match the COMBINED roster
        // exactly once rather than allowing either color to drift.
        if (color === "grey") continue;
        const pixels = anchors.filter((p) =>
          color === "black" ? (p.shirtColor === "black" || p.shirtColor === "grey")
            : p.shirtColor === color);
        // The orange mask sometimes includes one additional orange fragment.
        // Choose the best distinct centers using the global assignment below,
        // without changing the number of actual AI-inventoried shirts.
        // All other teams retain their previously validated matching behavior.
        const orangeExtraCandidate = color === "orange" && pixels.length === entries.length + 1;
        if (!entries.length || entries.length > 12 ||
            (!orangeExtraCandidate && entries.length !== pixels.length)) continue;
        // Exact global assignment for the small teams in coaching diagrams.
        // Its only job is to attach identities to fixed physical pixel centers.
        const memo = new Map<string, { cost: number; indices: number[] }>();
        const assign = (i: number, used: number): { cost: number; indices: number[] } => {
          if (i === entries.length) return { cost: 0, indices: [] };
          const key = `${i}:${used}`;
          const cached = memo.get(key);
          if (cached) return cached;
          let best = { cost: Infinity, indices: [] as number[] };
          for (let j = 0; j < pixels.length; j++) {
            if (used & (1 << j)) continue;
            const p = pixels[j];
            const dx = Number(entries[i].item.x) - p.x;
            const dy = Number(entries[i].item.y) - p.y;
            const remainder = assign(i + 1, used | (1 << j));
            const cost = dx * dx + dy * dy + remainder.cost;
            if (cost < best.cost) best = { cost, indices: [j, ...remainder.indices] };
          }
          memo.set(key, best);
          return best;
        };
        const match = assign(0, 0);
        for (let i = 0; i < entries.length; i++) {
          const source = entries[i];
          const center = pixels[match.indices[i]];
          updated[source.index] = { ...source.item, x: center.x, y: center.y };
        }
      }
      return updated;
    };
    // The red-pixel detector can pick up shirt fragments and image decorations,
    // especially near the crop border. It is NOT independent proof of a cone.
    // Keep the Gemini primary + specialist cone inventory unchanged; do not
    // manufacture additional cones from unmatched red pixel components.
    const conePixelsCredible = coneAnchors.length > 0 && coneAnchors.length <= 60;
    const reliablePhysical = [...physicalSource];
    // Pixel anchors are advisory only, and only support a uniquely matched
    // existing cone within a small radius. Avoid moving markers on weak proof.
    if (conePixelsCredible) {
      const existingCones = reliablePhysical.filter(raw =>
        (raw as Record<string, unknown>).type === "cone") as Record<string, unknown>[];
      const claimed = new Set<Record<string, unknown>>();
      for (const pixel of coneAnchors) {
        const matches = existingCones.filter(cone => !claimed.has(cone))
          .map(cone => ({cone, distance: Math.hypot(Number(cone.x)-pixel.x, Number(cone.y)-pixel.y)}))
          .sort((left, right) => left.distance - right.distance);
        if (matches.length !== 1 && (!matches[0] || matches[0].distance > 0.018 ||
            matches[1].distance - matches[0].distance < 0.025)) continue;
        if (!matches[0] || matches[0].distance > 0.018) continue;
        claimed.add(matches[0].cone);
        // Preserve vision coordinates unless independent pixel data agrees
        // locally; this guards against incorrectly snapped book markers.
        matches[0].cone.x = pixel.x;
        matches[0].cone.y = pixel.y;
      }
    }
    // The color-based shirt detector is advisory. Only replace a shirt center
    // when the same-color inventory and detected pixel count agree.
    const pixelAnchored = anchorObjects(reliablePhysical, "player", playerAnchors);
    // Independently measured shirts may expose a missing AI inventory entry.
    // Only recover a shirt if the pixel anchor is unique, not already matched,
    // and has a sufficiently distinct compact color. This never uses cone
    // positions or a presumed team size/formation.
    // The independently measured pixels may refine EXISTING detections, but
    // never provide enough evidence to create a numbered player. In particular
    // green markings and individual number glyphs can pass the pixel mask.
    // Keep the AI inventory as the sole authority on physical shirt count.
    const recoveredPhysical = [...pixelAnchored];
    // A source-pixel component is eligible as a missing orange jersey only if
    // it is isolated from every inventoried shirt and all other pixel anchors.
    // Do not infer a player from tactical formations or fixed team sizes.
    const orangeInventory = recoveredPhysical.filter((v) => {
      const item = v as Record<string, unknown>;
      return item.type === "player" && item.shirtColor === "orange";
    }) as Record<string, unknown>[];
    const orangePixels = playerAnchors.filter((p) => p.shirtColor === "orange");
    if (orangePixels.length === orangeInventory.length + 1 && orangeInventory.length >= 1) {
      const unmatched = orangePixels.filter((candidate) =>
        !orangeInventory.some((shirt) =>
          Math.hypot(Number(shirt.x) - candidate.x, Number(shirt.y) - candidate.y) < 0.075));
      if (unmatched.length === 1 && recoveredPhysical.every((v) => {
        const item = v as Record<string, unknown>;
        return item.type !== "player" ||
          Math.hypot(Number(item.x) - unmatched[0].x, Number(item.y) - unmatched[0].y) > 0.055;
      })) {
        // Unknown jersey number is intentionally left blank rather than guessed.
        recoveredPhysical.push({ type: "player", shirtColor: "orange",
          x: unmatched[0].x, y: unmatched[0].y, label: "" });
      }
    }
    // Independently restore a missed BLUE support jersey only with clear
    // measured photo-pixel evidence. Never use cone, line or team positions.
    const blueFound = recoveredPhysical.filter((v) => {
      const item = v as Record<string, unknown>;
      return item.type === "player" && String(item.shirtColor).toLowerCase() === "blue";
    }) as Record<string, unknown>[];
    const bluePixels = playerAnchors.filter((p) => p.shirtColor === "blue");
    if (bluePixels.length === blueFound.length + 1 && blueFound.length >= 1) {
      const unmatched = bluePixels.filter((p) =>
        !blueFound.some((shirt) => Math.hypot(Number(shirt.x) - p.x, Number(shirt.y) - p.y) < 0.09));
      if (unmatched.length === 1 &&
          recoveredPhysical.every((v) => {
            const item = v as Record<string, unknown>;
            return item.type !== "player" ||
              Math.hypot(Number(item.x) - unmatched[0].x, Number(item.y) - unmatched[0].y) > 0.065;
          })) {
        recoveredPhysical.push({ type: "player", shirtColor: "blue",
          x: unmatched[0].x, y: unmatched[0].y, label: "" });
      }
    }
    // Seven independent semantic layers. Classifying and mapping a layer must
    // never use another layer's positions, inferred formations or count.
    const asObject = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;
    const sourcePlayers = recoveredPhysical.filter((value) => asObject(value).type === "player");
    const supportByPosition = sourcePlayers.filter((value) => {
      const p = asObject(value);
      return String(p.shirtColor).toLowerCase() === "blue" ||
        String(p.label).toLowerCase() === "steunspeler";
    });
    const coaches = sourcePlayers.filter((value) =>
      String(asObject(value).label ?? "").trim().toUpperCase() === "T");
    const fieldPlayers = sourcePlayers.filter((value) =>
      !supportByPosition.includes(value) && !coaches.includes(value));
    const distinctTeams = [...new Set(fieldPlayers.map((value) =>
      String(asObject(value).shirtColor ?? "unknown").toLowerCase()))];
    const teamColors = distinctTeams.sort((a, b) =>
      fieldPlayers.filter((v) => String(asObject(v).shirtColor).toLowerCase() === b).length -
      fieldPlayers.filter((v) => String(asObject(v).shirtColor).toLowerCase() === a).length);
    const layerSources = {
      cones: recoveredPhysical.filter((v) => asObject(v).type === "cone" || asObject(v).type === "hat"),
      team1: fieldPlayers.filter((v) => String(asObject(v).shirtColor).toLowerCase() === teamColors[0]),
      team2: fieldPlayers.filter((v) => String(asObject(v).shirtColor).toLowerCase() === teamColors[1]),
      trainer: [...coaches, ...recoveredPhysical.filter((v) => asObject(v).type === "trainer")],
      passLines: sourceArrows.filter((v) => asObject(v).type === "passLine" || asObject(v).type === "guideLine"),
      runLines: sourceArrows.filter((v) => asObject(v).type === "runLine"),
      supportPlayers: supportByPosition,
    };
    // Preserve other detected colors and object types; do not drop them
    // merely because this seven-layer interface has only two named teams.
    const remainder = recoveredPhysical.filter((v) =>
      !Object.values(layerSources).some((layer) => layer.includes(v)));
    const layerOrder = ["cones", "team1", "team2", "trainer", "passLines", "runLines", "supportPlayers"] as const;
    const layers = {} as Record<typeof layerOrder[number], {
      status: "ok" | "warning" | "empty";
      detected: number; placed: number; reason: string; items: Array<Record<string, unknown>>;
    }>;
    for (const layer of layerOrder) {
      const raw = layerSources[layer];
      const items = normalizedItems(raw, calibration);
      const reasons: string[] = [];
      if (items.length !== raw.length) reasons.push("Niet alle objecten hebben geldige broncoördinaten.");
      if (layer === "cones" && !conePixelsCredible && raw.length)
        reasons.push("Pylonnen uit AI-coördinaten: geen betrouwbare pixelmeting beschikbaar.");
      if ((layer === "team1" || layer === "team2" || layer === "supportPlayers") &&
          raw.length && !playerAnchors.length)
        reasons.push("Geen betrouwbare shirt-pixelmeting beschikbaar; AI-posities gebruikt.");
      if ((layer === "passLines" || layer === "runLines") && raw.length)
        reasons.push("Lijnpunten komen uit vision: controleer begin, eind en richting op de overlay.");
      layers[layer] = {
        status: !raw.length ? "empty" : reasons.length ? "warning" : "ok",
        detected: raw.length, placed: items.length, reason: reasons.join(" "),
        items,
      };
    }
    // Keep each layer independent: neither a pass nor a running line may
    // change the identity, quantity or coordinates of a physical object.
    // Player and support-player geometry is finalized separately before lines.
    const sourceObjects = [...layerOrder.flatMap((layer) => layerSources[layer]), ...remainder];
    // Never present line type as certain when vision only returned a generic guide.
    // These are editable lines; the user can adjust their tactical meaning.
    const uniqueItems = normalizedItems(sourceObjects, calibration).map((item) => {
      // Grey playing jerseys are displayed as black; retain grey coach T.
      if (item.type === "player" && item.shirtColor === "grey" &&
          String(item.label ?? "").toUpperCase() !== "T") return { ...item, shirtColor: "black" };
      return item;
    });
    // Resolve only the pass-/run-line layer from actor RELATIONS. This runs
    // after every shirt has its final canvas coordinates. Physical layers are
    // immutable and do not depend on the connection results.
    const actorItems = uniqueItems.filter((item) => item.type === "player" ||
      (item.type === "trainer"));
    // Invert the EXACT overlay calibration. Do not nearest-match shirts to
    // another inventory entry: shirts can overlap and duplicates exist.
    const boardToPhoto = (x: number, y: number) => {
      let u = calibration.flipHorizontal ? 1 - x : x;
      let v = y;
      let p: { x: number; y: number };
      switch (calibration.rotation) {
        case 90: p = { x: v, y: 1 - u }; break;
        case 180: p = { x: 1 - u, y: 1 - v }; break;
        case 270: p = { x: 1 - v, y: u }; break;
        default: p = { x: u, y: v };
      }
      const b = calibration.bounds;
      return { x: b.left + p.x * (b.right - b.left),
        y: b.top + p.y * (b.bottom - b.top) };
    };
    const photoActors = actorItems.map((item, id) => {
      const point = boardToPhoto(Number(item.x), Number(item.y));
      return { id, x: point.x, y: point.y,
        color: String(item.shirtColor ?? ""), label: String(item.label ?? "") };
    });
    // Audit OCR after all shirt positions are fixed, before giving numbered
    // actors to the line-matching model. Never alter a physical layer here.
    const numberedActors = photoActors.filter((actor) =>
      ["black", "grey", "orange"].includes(actor.color.toLowerCase()) &&
      actorItems[actor.id]?.type !== "trainer" &&
      actor.label.trim().toUpperCase() !== "T");
    // One AI reading can confidently invent a number, especially on small
    // phone-sized uploads. Require two independent matching readings for a
    // relabel; any disagreement keeps the earlier label and never moves a shirt.
    const [firstJerseyReadings, secondJerseyReadings] = await Promise.all([
      verifyJerseyNumbers(key!, visionModel, mimeType, base64,
        numberedActors.map(({ id, x, y, color }) => ({ id, x, y, color }))),
      verifyJerseyNumbers(key!, visionModel, mimeType, base64,
        numberedActors.map(({ id, x, y, color }) => ({ id, x, y, color }))),
    ]);
    const toUniqueDigitMap = (readings: Array<{ id: number; number: string }>) => {
      const perActor = new Map<number, string>();
      const duplicatedIds = new Set<number>();
      for (const reading of readings) {
        const id = Number(reading?.id);
        const digit = String(reading?.number ?? "").trim();
        if (!Number.isInteger(id) || !/^[0-9]$/.test(digit) ||
            !numberedActors.some((actor) => actor.id === id)) continue;
        if (perActor.has(id)) duplicatedIds.add(id);
        else perActor.set(id, digit);
      }
      for (const id of duplicatedIds) perActor.delete(id);
      return perActor;
    };
    const firstDigits = toUniqueDigitMap(firstJerseyReadings);
    const secondDigits = toUniqueDigitMap(secondJerseyReadings);
    const reliableDigits = new Map<number, string>();
    const teamDigits = new Map<string, Map<string, number>>();
    for (const actor of numberedActors) {
      const first = firstDigits.get(actor.id), second = secondDigits.get(actor.id);
      if (!first || first !== second) continue;
      reliableDigits.set(actor.id, first);
      const team = actor.color.toLowerCase() === "grey" ? "black" : actor.color.toLowerCase();
      if (!teamDigits.has(team)) teamDigits.set(team, new Map());
      const counts = teamDigits.get(team)!;
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    // No duplicates on one team, no guessing missing labels, no reordering.
    for (const actor of numberedActors) {
      const digit = reliableDigits.get(actor.id);
      const team = actor.color.toLowerCase() === "grey" ? "black" : actor.color.toLowerCase();
      if (!digit || teamDigits.get(team)?.get(digit) !== 1) continue;
      actorItems[actor.id].label = digit;
      photoActors[actor.id].label = digit;
    }
    const canvasArrows = uniqueItems.filter((item) => lineTypes.has(String(item.type)));
    const rawPhotoArrows = sourceArrows as Array<Record<string, unknown>>;
    const arrowRequests = canvasArrows.map((item, id) => {
      const source = rawPhotoArrows[id] ?? item;
      return { id, x: Number(source.x), y: Number(source.y),
        x2: Number(source.x2), y2: Number(source.y2), type: String(item.type) };
    });
    // Passes connect players. Trainers remain on the canvas, but are not
    // eligible pass endpoints. Preserve original actor IDs for exact mapping.
    const eligiblePassActors = photoActors.filter((actor) =>
      actorItems[actor.id]?.type !== "trainer" &&
      String(actor.label).trim().toUpperCase() !== "T");
    const firstConnections = await analyzeActorConnections(key!, visionModel, mimeType, base64,
      eligiblePassActors, arrowRequests);
    // Ask for a separate, object-ID-only reading of the visible arrows.
    // The second opinion is independent of the first model's proposed edges.
    // Only agreement may move a line to shirt centres. This protects a good
    // connection against an unrelated guessed trainer/player pairing.
    const secondConnections = await analyzeActorConnections(key!, visionModel, mimeType, base64,
      eligiblePassActors, arrowRequests, "verify");
    const secondByLine = new Map<number, (typeof secondConnections)[number]>();
    for (const proposed of secondConnections) {
      const id = Number(proposed.lineId);
      if (Number.isInteger(id) && !secondByLine.has(id)) secondByLine.set(id, proposed);
    }
    // Keep stable connections untouched. Re-evaluate ONLY disagreements and
    // candidates absent from the first pass; avoid re-randomizing good arrows.
    const firstByLine = new Map<number, (typeof firstConnections)[number]>();
    for (const item of firstConnections) {
      const id = Number(item.lineId);
      if (Number.isInteger(id) && !firstByLine.has(id)) firstByLine.set(id, item);
    }
    const sameEndpoints = (
      a: (typeof firstConnections)[number] | undefined,
      b: (typeof firstConnections)[number] | undefined,
    ) => Boolean(a && b &&
      Number(a.fromActorId) === Number(b.fromActorId) &&
      Number(a.toActorId) === Number(b.toActorId));
    const disputedLines = arrowRequests.filter((line) =>
      !sameEndpoints(firstByLine.get(line.id), secondByLine.get(line.id)));
    const thirdConnections = disputedLines.length ?
      await analyzeActorConnections(key!, visionModel, mimeType, base64,
        eligiblePassActors, disputedLines, "verify") : [];
    const thirdByLine = new Map<number, (typeof firstConnections)[number]>();
    for (const proposal of thirdConnections) {
      const id = Number(proposal.lineId);
      if (Number.isInteger(id) && !thirdByLine.has(id)) thirdByLine.set(id, proposal);
    }
    // Resolve disagreements by the *measured* photo-space arrow endpoints,
    // never by tactical assumptions or the old rough candidate coordinates.
    // This changes only pass-line snapping, not player or cone placement.
    const fitsMeasuredArrow = (candidate: (typeof firstConnections)[number] | undefined) => {
      if (!candidate) return false;
      const fromId = Number(candidate.fromActorId), toId = Number(candidate.toActorId);
      if (!Number.isInteger(fromId) || !Number.isInteger(toId) || fromId === toId ||
          !eligiblePassActors.some((actor) => actor.id === fromId) ||
          !eligiblePassActors.some((actor) => actor.id === toId)) return false;
      const from = photoActors[fromId], to = photoActors[toId];
      const tail = candidate.tail, tip = candidate.tip;
      if (!tail || !tip || ![tail.x, tail.y, tip.x, tip.y].every(
        (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)) return false;
      const tailError = Math.hypot(tail.x - from.x, tail.y - from.y);
      const tipError = Math.hypot(tip.x - to.x, tip.y - to.y);
      const arrowLength = Math.hypot(tip.x - tail.x, tip.y - tail.y);
      const actorLength = Math.hypot(to.x - from.x, to.y - from.y);
      if (arrowLength < 0.025 || actorLength < 0.025 || tailError > 0.085 || tipError > 0.085)
        return false;
      const dot = ((tip.x - tail.x) * (to.x - from.x) +
        (tip.y - tail.y) * (to.y - from.y)) / (arrowLength * actorLength);
      if (dot < 0.75) return false;
      // A nearby different shirt makes this a genuinely ambiguous endpoint.
      return !photoActors.some((actor) => actor.id !== fromId &&
          Math.hypot(actor.x - tail.x, actor.y - tail.y) + 0.025 < tailError) &&
        !photoActors.some((actor) => actor.id !== toId &&
          Math.hypot(actor.x - tip.x, actor.y - tip.y) + 0.025 < tipError);
    };
    const connections = arrowRequests.flatMap((line) => {
      const a = firstByLine.get(line.id);
      const b = secondByLine.get(line.id);
      const c = thirdByLine.get(line.id);
      // Two independently measured directed relations must agree. A reversed
      // pair does NOT count as agreement (the arrowhead is authoritative).
      const agreed = sameEndpoints(a, b) ? a :
        sameEndpoints(a, c) ? a : sameEndpoints(b, c) ? b : undefined;
      // If the models disagree, accept only ONE distinct directed relation
      // that independently matches the actual photographed tail and arrowhead.
      // Multiple geometrically plausible relations remain unresolved.
      // Independently validate each proposed directed relation. A voting
      // majority alone must never move an arrow to a different jersey.
      const plausible = [a, b, c].filter(fitsMeasuredArrow);
      const uniquePlausible = plausible.filter((candidate, index) =>
        plausible.findIndex((other) => sameEndpoints(candidate, other)) === index);
      // Consensus is not evidence when the claimed arrow endpoints do not
      // physically meet those players. Prefer a uniquely geometry-verified
      // directed edge over an invalid majority guess.
      const pixelVerified = uniquePlausible.length === 1 ? uniquePlausible[0] : undefined;
      const consensusVerified = agreed && fitsMeasuredArrow(agreed) ? agreed : undefined;
      const selected = pixelVerified ?? consensusVerified ?? agreed ?? a ?? b ?? c;
      // A drawn arrow can terminate slightly outside a jersey icon. For a
      // disputed connection accepted independently by 2 readings, tolerate
      // that gap ONLY when both endpoints are still near their actors and
      // the measured arrow faces in the same direction. Never use this for a
      // single unsupported guess or for moving another layer.
      const consensusNearArrow = Boolean(agreed && (() => {
        const from = photoActors[Number(agreed.fromActorId)];
        const to = photoActors[Number(agreed.toActorId)];
        const tail = agreed.tail, tip = agreed.tip;
        if (!from || !to || !tail || !tip || ![tail.x, tail.y, tip.x, tip.y].every(
          (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)) return false;
        const d1 = Math.hypot(tail.x - from.x, tail.y - from.y);
        const d2 = Math.hypot(tip.x - to.x, tip.y - to.y);
        const arrowLength = Math.hypot(tip.x - tail.x, tip.y - tail.y);
        const actorLength = Math.hypot(to.x - from.x, to.y - from.y);
        if (d1 > 0.115 || d2 > 0.115 || arrowLength < 0.025 || actorLength < 0.025)
          return false;
        const dot = ((tip.x - tail.x) * (to.x - from.x) +
          (tip.y - tail.y) * (to.y - from.y)) / (arrowLength * actorLength);
        if (dot < 0.85) return false;
        return !photoActors.some((actor) => actor.id !== from.id &&
          Math.hypot(actor.x - tail.x) + Math.abs(actor.y - tail.y) + 0.02 <
          Math.hypot(from.x - tail.x) + Math.abs(from.y - tail.y)) &&
          !photoActors.some((actor) => actor.id !== to.id &&
          Math.hypot(actor.x - tip.x) + Math.abs(actor.y - tip.y) + 0.02 <
          Math.hypot(to.x - tip.x) + Math.abs(to.y - tip.y));
      })());
      const verified = Boolean(selected &&
        (fitsMeasuredArrow(selected) || (sameEndpoints(selected, agreed) && consensusNearArrow)) &&
        (pixelVerified || consensusVerified || consensusNearArrow));
      return selected ? [{ ...selected, agreed: verified,
        pixelVerified: Boolean(verified && pixelVerified &&
          sameEndpoints(selected, pixelVerified)) }] : [];
    });
    // Expose the AI's interpretation as diagnostics even when geometry rejects
    // a connection. Never present an unvalidated guess as a confirmed route.
    const blueActors = actorItems.map((actor, id) => ({ actor, id }))
      .filter(({ actor }) => String(actor.shirtColor ?? "").toLowerCase() === "blue")
      .sort((a, b) => Number(a.actor.x) - Number(b.actor.x));
    const describeActor = (id: number) => {
      const actor = actorItems[id];
      if (!actor) return "Onbekende speler";
      const color = String(actor.shirtColor ?? "").toLowerCase();
      const number = String(actor.label ?? "").trim();
      if (color === "blue") {
        const position = blueActors.length < 2 ? "" :
          blueActors[0]?.id === id ? " links" :
          blueActors[blueActors.length - 1]?.id === id ? " rechts" : "";
        return `Steunspeler${position}`;
      }
      if (actor.type === "trainer" || number.toUpperCase() === "T")
        return "Trainer";
      const team = color === "black" ? "zwart" : color === "orange" ? "oranje" : color;
      return `Aanvaller${number ? ` ${number}` : ""}${team ? ` (${team})` : ""}`;
    };
    const lineConnections: Array<{ line: number; from: string; to: string; type: string; status: string }> =
      canvasArrows.map((arrow, index) => ({
        line: index + 1, from: "Onbekend", to: "Onbekend",
        type: String(arrow.type), status: "niet herkend",
      }));
    for (const value of connections) {
      const lineId = Number(value?.lineId);
      const fromId = Number(value?.fromActorId);
      const toId = Number(value?.toActorId);
      if (!Number.isInteger(lineId) || lineId < 0 || lineId >= lineConnections.length ||
          !Number.isInteger(fromId) || !Number.isInteger(toId) ||
          !actorItems[fromId] || !actorItems[toId]) continue;
      const trainerInPass = canvasArrows[lineId]?.type === "passLine" &&
        (actorItems[fromId]?.type === "trainer" || actorItems[toId]?.type === "trainer" ||
          String(actorItems[fromId]?.label ?? "").trim().toUpperCase() === "T" ||
          String(actorItems[toId]?.label ?? "").trim().toUpperCase() === "T");
      lineConnections[lineId] = {
        line: lineId + 1, from: describeActor(fromId), to: describeActor(toId),
        type: String(canvasArrows[lineId]?.type ?? "guideLine"),
        status: trainerInPass ? "afgewezen: trainer is geen passspeler" :
          value.pixelVerified ? "bevestigd via pijlpixels" :
          value.agreed ? "voorgesteld" : "onzeker: analyses verschillen",
      };
    }
    let connectedLineCount = 0;
    let rejectedActorConnections = 0;
    const usedConnectionLines = new Set<number>();
    for (const raw of connections) {
      if (!raw) continue;
      const lineId = Number(raw.lineId);
      const fromId = Number(raw.fromActorId);
      const toId = Number(raw.toActorId);
      if (![lineId, fromId, toId].every(Number.isInteger) ||
          usedConnectionLines.has(lineId) || fromId === toId) continue;
      const item = canvasArrows[lineId];
      const from = actorItems[fromId], to = actorItems[toId];
      if (!item || !from || !to || !lineTypes.has(String(item.type))) continue;
      if (item.type === "passLine" && (from.type === "trainer" || to.type === "trainer" ||
          String(from.label ?? "").trim().toUpperCase() === "T" ||
          String(to.label ?? "").trim().toUpperCase() === "T")) {
        rejectedActorConnections++;
        continue;
      }
      if (!raw.agreed) { rejectedActorConnections++; continue; }
      if (raw.type !== "passLine" && raw.type !== "runLine") continue;
      const dx = Number(to.x) - Number(from.x), dy = Number(to.y) - Number(from.y);
      if (Math.hypot(dx, dy) < 0.025) continue;
      // Validate against the NEW independent image-space line trace, not
      // against the OLD candidate arrows (their endpoints are known wrong).
      // Never snap a visually unsupported relation onto a random jersey.
      const candidate = raw as typeof raw & {
        tail?: { x: number; y: number }; tip?: { x: number; y: number };
      };
      const tail = candidate.tail, tip = candidate.tip;
      if (!tail || !tip ||
          ![tail.x, tail.y, tip.x, tip.y].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)) {
        rejectedActorConnections++;
        continue;
      }
      const fromPhoto = photoActors[fromId], toPhoto = photoActors[toId];
      const tailError = Math.hypot(tail.x - fromPhoto.x, tail.y - fromPhoto.y);
      const tipError = Math.hypot(tip.x - toPhoto.x, tip.y - toPhoto.y);
      const arrowLength = Math.hypot(tip.x - tail.x, tip.y - tail.y);
      const actorLength = Math.hypot(toPhoto.x - fromPhoto.x, toPhoto.y - fromPhoto.y);
      const directionDot = ((tip.x - tail.x) * (toPhoto.x - fromPhoto.x) +
        (tip.y - tail.y) * (toPhoto.y - fromPhoto.y)) /
        Math.max(0.000001, arrowLength * actorLength);
      // The source and destination must agree with the measured visible
      // endpoints. Allow margin for jerseys' physical size, not large jumps.
      // Independently agreed routes already passed the guarded relaxed
      // endpoint check above. Preserve the strict path for every other line.
      const consensusEndpointMargin = Boolean(raw.agreed && !raw.pixelVerified);
      const maxError = consensusEndpointMargin ? 0.115 : 0.085;
      const minDot = consensusEndpointMargin ? 0.85 : 0.75;
      if (arrowLength < 0.025 || tailError > maxError || tipError > maxError ||
          directionDot < minDot) {
        rejectedActorConnections++;
        continue;
      }
      // Reject a claimed identity when a different actor is obviously nearer
      // to that line endpoint. Prevents ambiguous overlapping players.
      const closerOther = (point: { x: number; y: number }, id: number, error: number) =>
        photoActors.some((actor) => actor.id !== id &&
          Math.hypot(actor.x - point.x, actor.y - point.y) + 0.025 < error);
      if (closerOther(tail, fromId, tailError) || closerOther(tip, toId, tipError)) {
        rejectedActorConnections++;
        continue;
      }
      item.x = from.x; item.y = from.y; item.x2 = to.x; item.y2 = to.y;
      // The actor-relation vision pass determines endpoints only. It must
      // never silently change an already classified pass into a run line.
      // Preserve the source-arrow style classification.
      item.type = item.type;
      usedConnectionLines.add(lineId);
      lineConnections[lineId].status = "bevestigd";
      connectedLineCount++;
    }
    // Geometry and counts are independent. Each accepted inventory object
    // produces exactly one canvas item, including overlapping shirts.
    const countTypes = (values: Array<Record<string, unknown>>) => {
      const counts: Record<string, number> = {};
      for (const value of values) {
        const type = String(value.type);
        counts[type] = (counts[type] || 0) + 1;
      }
      return counts;
    };
    const inventoryCounts = countTypes(reliablePhysical as Array<Record<string, unknown>>);
    const outputCounts = countTypes(uniqueItems);
    const warnings: string[] = [];
    if (rejectedActorConnections)
      warnings.push(`${rejectedActorConnections} onzekere spelerverbinding(en) geweigerd: ze pasten niet bij de plaats en richting van de getekende pijl.`);
    if (canvasArrows.length && connectedLineCount < canvasArrows.length)
      warnings.push(`Speler-naar-speler verbindingen: ${connectedLineCount}/${canvasArrows.length} bevestigd; overige pijlen gebruiken de foto-coördinaten.`);
    if (focusedUnique.length && genericNormalized.length && focusedUnique.length !== genericNormalized.length)
      warnings.push("De twee AI-analyses tellen verschillende aantallen pijlen. Alleen de afzonderlijk getraceerde pijlen zijn gebruikt; controleer de foto.");
    if (sourceArrows.length && verifiedEndpoints < sourceArrows.length * 2)
      warnings.push(`Lijn-eindpunten onafhankelijk gecontroleerd: ${verifiedEndpoints}/${sourceArrows.length * 2}. Niet-bevestigde punten blijven ongewijzigd.`);
    if (arrowItems.length && focusedNormalized.length !== arrowItems.length)
      warnings.push("Sommige herkende pijlen hadden ongeldige, niet-genormaliseerde of samenvallende eindpunten. Alleen werkelijk tekenbare lijnen zijn meegenomen.");
    if (sourceArrows.length === 0 && (arrowItems.length || genericNormalized.length))
      warnings.push("Geen betrouwbare pijlcoördinaten overgebleven. Teken deze lijnen handmatig of probeer een duidelijkere foto.");
    if (!inventoryItems?.length) warnings.push("Aparte inventarisatie niet beschikbaar: controleer de aantallen.");
    if (playerAnchors.length && playerAnchors.length !== physicalSource.filter((v) =>
      (v as Record<string, unknown>).type === "player").length)
      warnings.push("Shirt-pixeltelling verschilt van AI-inventaris: geen extra spelers aangemaakt; controleer ontbrekende of dubbel gedetecteerde shirts.");
    if (sourceArrows.length && sourceArrows.every((v) => (v as Record<string, unknown>).type === "guideLine"))
      warnings.push("Pijltypes zijn onzeker: alle lijnen als algemene hulplijn gedetecteerd.");
    if (conePixelsCredible && coneAnchors.length !== physicalSource.filter((obj) => (obj as Record<string, unknown>).type === "cone").length) warnings.push("Aantal AI-pylonnen wijkt af van de gemeten foto: de fotopixels zijn gebruikt.");
    for (const [type, count] of Object.entries(inventoryCounts)) {
      if ((outputCounts[type] || 0) < count) warnings.push(`Niet alle herkende ${type}-objecten zijn geplaatst.`);
    }
    // Diagnostic-only snapshot. These values must NEVER feed back into layout,
    // player numbering, snapping or the AI inference.
    const fmtCoord = (value: unknown) => {
      const n = Number(value);
      return Number.isFinite(n) ? n.toFixed(4) : "ongeldig";
    };
    const shirtCoords = actorItems.map((shirt, id) => ({
      id, type: String(shirt.type), color: String(shirt.shirtColor ?? shirt.color ?? "?"),
      number: String(shirt.label ?? shirt.number ?? "-"),
      x: Number(shirt.x), y: Number(shirt.y),
    }));
    const arrowCoords = canvasArrows.map((arrow, id) => ({
      id: id + 1, type: String(arrow.type),
      photo: arrowRequests[id] ?? null,
      canvas: { x: Number(arrow.x), y: Number(arrow.y),
        x2: Number(arrow.x2), y2: Number(arrow.y2) },
      relation: lineConnections[id] ?? null,
    }));
    warnings.push("DEBUG COÖRDINATEN (0–1; foto = bron, canvas = eindresultaat):");
    shirtCoords.forEach(shirt => warnings.push(
      `Shirt #${shirt.id} [${shirt.type}, ${shirt.color}, rugnr ${shirt.number}]: center (${fmtCoord(shirt.x)}, ${fmtCoord(shirt.y)})`
    ));
    arrowCoords.forEach(arrow => warnings.push(
      `Pijl #${arrow.id} [${arrow.type}; ${arrow.relation?.status ?? "onbekend"}; ${arrow.relation?.from ?? "?"} → ${arrow.relation?.to ?? "?"}]: bron (${fmtCoord(arrow.photo?.x)}, ${fmtCoord(arrow.photo?.y)}) → (${fmtCoord(arrow.photo?.x2)}, ${fmtCoord(arrow.photo?.y2)}); canvas (${fmtCoord(arrow.canvas.x)}, ${fmtCoord(arrow.canvas.y)}) → (${fmtCoord(arrow.canvas.x2)}, ${fmtCoord(arrow.canvas.y2)})`
    ));
    const safeText = (v: unknown) => typeof v === "string" ? v.slice(0, 4000) : "";
    return json({
      title: safeText(parsed.title).slice(0, 160),
      subtitle: safeText(parsed.subtitle).slice(0, 300),
      explanation: safeText(parsed.explanation),
      instructions: safeText(parsed.instructions),
      board_layout: { fieldMode: "half", fieldOrientation: "top", items: uniqueItems },
      // Keep source field crop for a pixel-aligned overlay on the editor.
      field_calibration: calibration,
      import_audit: { inventory: inventoryCounts, placed: outputCounts, warnings, lineConnections, coordinateDebug: { shirts: shirtCoords, arrows: arrowCoords, calibration } },
      layers,
    });
  } catch {
    return json({ error: "Could not analyze this image." }, 500);
  }
});
