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

// Separate inventory pass: count every actual visible object before the
// normal coordinate/label alignment. A list entry is one physical object,
// including adjacent/overlapping shirts. No expected team sizes are assumed.
async function analyzeObjectInventory(key: string, model: string, mimeType: string, base64: string): Promise<unknown[] | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
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


/**
 * Independently read visible jersey numbers AFTER the geometry pass. This
 * stage is advisory: it must never create a player or move a pixel anchor.
 * A failed audit leaves the original reconstruction intact.
 */
async function analyzeJerseyLabels(key: string, model: string, mimeType: string, base64: string): Promise<unknown[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
    const nearest = bluePixels.map((pixel, index) => ({ pixel, index, d: distance(pixel, position) }))
      .filter((candidate) => candidate.d <= 0.14 && !used.has(candidate.index))
      .sort((a, b) => a.d - b.d);
    if (!nearest.length || (nearest[1] && nearest[1].d - nearest[0].d < 0.02)) continue;
    const best = nearest[0];
    used.add(best.index);
    if (players.some((p) => p.shirtColor === "blue" &&
        distance({ x: Number(p.x), y: Number(p.y) }, best.pixel) < 0.05)) continue;
    const recovered: Record<string, unknown> = {
      id: `import-support-${items.length + result.length}`,
      type: "player", x: best.pixel.x, y: best.pixel.y, shirtColor: "blue", label: "",
    };
    result.push(recovered);
    players.push(recovered);
  }
  return result;
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
    // Dedicated, optional number-reading pass. Keep the original import if
    // the provider fails or returns ambiguous labels.
    let jerseyAudit: unknown[] = [];
    try {
      jerseyAudit = await analyzeJerseyLabels(key!, visionModel, mimeType, base64);
    } catch {
      // Never fail the import because of the optional jersey audit.
    }
    // The initial pass finds jerseys/cones/text and calibrates the field. Trace arrows
    // separately to avoid a common failure mode where players are connected arbitrarily.
    let arrowItems: unknown[] = [];
    try {
      arrowItems = await analyzeArrows(key!, visionModel, mimeType, base64);
    } catch {
      // A transient second-pass failure must not discard a successful first pass.
    }
    // Prefer a dedicated inventory that explicitly counts all individual
    // objects. If that optional pass fails, retain the original vision result.
    let inventoryItems: unknown[] | null = null;
    try {
      inventoryItems = await analyzeObjectInventory(key!, visionModel, mimeType, base64);
    } catch {
      // An unavailable inventory pass must not break normal imports.
    }
    const sourceVisualItems: unknown = inventoryItems?.length ? inventoryItems : parsed.items;
    const visualItems = Array.isArray(sourceVisualItems)
      ? sourceVisualItems.filter((item: Record<string, unknown>) => !lineTypes.has(String(item?.type)))
      : [];
    const fallbackArrows = Array.isArray(parsed.items)
      ? parsed.items.filter((item: Record<string, unknown>) => lineTypes.has(String(item?.type))) : [];
    // Use original image pixels for cone centers when web-side detection succeeds.
    // In particular, do not retain hallucinated cone rows from the model.
    const pixelCones = Array.isArray(body?.detectedCones) && body.detectedCones.length <= 80
      ? body.detectedCones.filter((point: unknown) => {
          if (!point || typeof point !== "object") return false;
          const p = point as Record<string, unknown>;
          return typeof p.x === "number" && typeof p.y === "number" &&
            Number.isFinite(p.x) && Number.isFinite(p.y) &&
            p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
        }) : [];
    const sourceItems = pixelCones.length
      ? visualItems.filter((item: Record<string, unknown>) => item?.type !== "cone")
      : visualItems;
    const mappedCones = pixelCones.map((point: { x: number; y: number }) =>
      ({ type: "cone", x: point.x, y: point.y }));
    const normalized = normalizedItems(
      [...sourceItems, ...mappedCones, ...(arrowItems.length ? arrowItems : fallbackArrows)],
      calibration,
    );
    const uniqueItems = filterUnanchoredArrows(anchorSupportLabels(recoverSupportPlayers(recoverVerifiedJerseys(
      normalizeGreyTeamPlayers(normalizeTrainerObjects(applyDiagramConstraints(deduplicateDetections(
        auditJerseyLabels(anchorPixelPlayers(normalized, body?.detectedPlayers, calibration, jerseyAudit), jerseyAudit, calibration),
      )))),
      jerseyAudit, body?.detectedPlayers, calibration,
    ), body?.detectedPlayers, calibration)));
    const safeText = (v: unknown) => typeof v === "string" ? v.slice(0, 4000) : "";
    return json({
      title: safeText(parsed.title).slice(0, 160),
      subtitle: safeText(parsed.subtitle).slice(0, 300),
      explanation: safeText(parsed.explanation),
      instructions: safeText(parsed.instructions),
      board_layout: { fieldMode: "half", fieldOrientation: "top", items: uniqueItems },
    });
  } catch {
    return json({ error: "Could not analyze this image." }, 500);
  }
});
