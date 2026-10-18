// Stateless Streamable HTTP MCP adapter for the HockeyApp import API.
// The adapter does not receive ChatGPT chat attachments automatically: clients
// must explicitly supply the unmodified uploaded file bytes as base64.
// Deploy with --no-verify-jwt. All requests need a separate secret bearer token.
const PROJECT_REF = "shllbltitjogepjeyxdr";
const IMPORT_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/import-chat-exercises`;
const PROTOCOL_VERSION = "2025-06-18";
const MAX_REQUEST_BYTES = 42_000_000;

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "mcp-protocol-version": PROTOCOL_VERSION,
      "vary": "Authorization",
    },
  });
}
function rpc(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function toolError(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}
function jsonTool(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
}
function secretsMatch(supplied: string, expected: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(supplied), b = encoder.encode(expected);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return difference === 0;
}
const tools = [
  {
    name: "list_exercise_categories",
    title: "HockeyApp: categorieën",
    description: "Haal de actuele categorie-slugs en namen uit H.C. Winsum op. Gebruik een bestaande slug voor elke nieuwe oefening.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "import_exercises",
    title: "HockeyApp: oefeningen toevoegen",
    description: "Voeg 1-12 hockeyoefeningen met de ONGEWIJZIGDE originele chatfoto toe aan H.C. Winsum. Genereer of teken geen foto. Vereist de exacte oorspronkelijke JPEG/PNG/WebP-bestandsbytes, als base64, met bijbehorende SHA-256. Een zichtbare chatfoto is op zichzelf GEEN beschikbare base64-bijlage. Als de originele bytes niet door de koppeling beschikbaar worden gesteld, roep deze actie niet aan en meld dat de import niet kan worden afgerond.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["exercises"],
      properties: {
        exercises: {
          type: "array",
          minItems: 1, maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "category_slug", "difficulty", "audience", "image"],
            properties: {
              title: { type: "string" },
              category_slug: { type: "string" },
              difficulty: { type: "string", enum: ["Makkelijk", "Gemiddeld", "Moeilijk"] },
              audience: { type: "array", items: { type: "string", enum: ["JO8", "JO10", "JO12", "JO14", "JO16", "JO18", "MO8", "MO10", "MO12", "MO14", "MO16", "MO18", "Senioren"] }, minItems: 1 },
              subtitle: { type: "string" },
              explanation: { type: "string" },
              instructions: { type: "string" },
              simplify: { type: "string" },
              build_up: { type: "string" },
              image: {
                type: "object",
                additionalProperties: false,
                required: ["source", "mimeType", "sha256", "base64"],
                properties: {
                  source: { type: "string", enum: ["original_upload"] },
                  mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp"] },
                  sha256: { type: "string", description: "SHA-256 lowercase hex calculated over the EXACT user-uploaded file bytes" },
                  base64: { type: "string", description: "Original unchanged photo bytes encoded in base64; NOT generated image contents." },
                },
              },
            },
          },
        },
      },
    },
  },
] as const;

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return reply({ error: "MCP requires POST." }, 405);
  const configured = Deno.env.get("EXERCISE_IMPORT_TOKEN") || "";
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!configured || configured.length < 32) return reply({ error: "MCP import not configured." }, 503);
  if (!bearer || !secretsMatch(bearer, configured)) {
    return reply({ error: "Unauthorized." }, 401);
  }
  if (Number(request.headers.get("content-length") || 0) > MAX_REQUEST_BYTES) {
    return reply({ error: "Request too large." }, 413);
  }
  let message: Record<string, unknown>;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_REQUEST_BYTES) return reply({ error: "Request too large." }, 413);
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply(rpcError(null, -32600, "Invalid request"));
    message = parsed;
  } catch {
    return reply(rpcError(null, -32700, "Parse error"));
  }
  // Notifications do not have an id and receive no JSON-RPC response.
  if (!Object.prototype.hasOwnProperty.call(message, "id")) return new Response(null, { status: 202 });
  const id = message.id;
  const method = String(message.method || "");
  if (method === "initialize") {
    return reply(rpc(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "hc-winsum-exercise-import", version: "1.0.0" },
      instructions: "Gebruik eerst list_exercise_categories. Importeer alleen als de originele foto als ongewijzigde bestandsbytes beschikbaar is. Nooit zelf een afbeelding genereren of een preview uploaden.",
    }));
  }
  if (method === "ping") return reply(rpc(id, {}));
  if (method === "tools/list") return reply(rpc(id, { tools }));
  if (method !== "tools/call") return reply(rpcError(id, -32601, "Method not found"));
  const params = message.params as Record<string, unknown> | undefined;
  if (!params || typeof params !== "object") return reply(rpcError(id, -32602, "Missing parameters"));
  const name = String(params.name || "");
  if (name !== "list_exercise_categories" && name !== "import_exercises") return reply(rpcError(id, -32602, "Unknown tool"));
  const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
    ? params.arguments as Record<string, unknown> : {};
  try {
    const upstream = await fetch(IMPORT_URL, {
      method: name === "list_exercise_categories" ? "GET" : "POST",
      headers: { "x-import-token": configured, "content-type": "application/json" },
      ...(name === "import_exercises" ? { body: JSON.stringify(args) } : {}),
      signal: AbortSignal.timeout(120_000),
    });
    const value = await upstream.json();
    if (!upstream.ok && upstream.status !== 207) {
      return reply(rpc(id, toolError("Importservice fout (" + upstream.status + "): " + String(value?.error || "Onbekende fout"))));
    }
    return reply(rpc(id, jsonTool(value)));
  } catch {
    return reply(rpc(id, toolError("Importservice niet bereikbaar; niets als opgeslagen melden.")));
  }
});
