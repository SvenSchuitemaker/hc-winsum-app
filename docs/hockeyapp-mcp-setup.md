# HockeyApp MCP integration (ChatGPT)

The new `hockeyapp-mcp` Supabase Edge Function presents two tools through **stateless Streamable HTTP MCP**:

- `list_exercise_categories`: GET current categories from the existing `import-chat-exercises` backend.
- `import_exercises`: POST recognized exercise data plus **the unaltered original uploaded image bytes**, SHA-256 checksum, and MIME type.

The MCP server does **not** access ChatGPT uploads by itself. Image content visible to the model is NOT an automatic file-byte attachment. Never reconstruct the original using generated images, screenshots, or redrawings.

## Deployment

Once merged to `main`, GitHub Actions deploys `hockeyapp-mcp` using `--no-verify-jwt` because this endpoint enforces its own bearer-token authentication. Check the **Deploy Supabase Edge Functions** workflow run.

- MCP URL: `https://shllbltitjogepjeyxdr.supabase.co/functions/v1/hockeyapp-mcp`
- Required header: `Authorization: Bearer <EXERCISE_IMPORT_TOKEN>`
- The token is the same Supabase secret used by `import-chat-exercises`; it must be configured to at least 32 random characters.
- **Never paste the token into a chat, project instructions, public URL, or GitHub code**.

## What still needs to be connected

This release is the authenticated MCP **server-side bridge**, not a completed one-click ChatGPT integration.

1. **Authentication:** The endpoint currently expects a static bearer secret. A standard ChatGPT custom-plugin setup may require OAuth instead of supplying arbitrary static headers. Do not expose or downgrade this secret to make connection easier. An OAuth-capable broker or connector that securely injects the header is required if the ChatGPT plugin UI cannot configure headers.
2. **File transfer:** A chat image is not automatically forwarded by MCP. The client needs access to the original uploaded file bytes and must populate `image.base64`, `image.mimeType`, `image.sha256`, and `image.source = "original_upload"`. In particular, do not invent or regenerate base64 from model vision. If the ChatGPT Project cannot provide the file to the MCP tool, a file-capable connector or approved file-picker UI is still needed.
3. **App installation:** Connect the authorized MCP server/plugin in ChatGPT Settings → Plugins (wording may change) and enable it in the HockeyApp project. The connection requires explicit user action.

Until these are addressed, **do not tell the user** the new ChatGPT Project automatically imports photos.

## Protocol contract

JSON-RPC 2.0 over HTTPS POST, responds `application/json` without session state. Methods `initialize`, `ping`, `tools/list`, `tools/call`, with `notifications/initialized` returning 202. Supports `2025-06-18` protocol version.

The `import_exercises` tool mirrors the existing backend structure; it accepts `{ "exercises": [ ... ] }` (up to 12), and each exercise has:
- title, category_slug, difficulty, audience; optional subtitle, explanation, instructions, simplify, build_up.
- image: `{ "source": "original_upload", "mimeType": "image/jpeg", "sha256": "<64 lowercase hex>", "base64": "<original file bytes>" }`.

The upstream importer validates the image format and checksum, creates Storage objects, and returns a per-item result with `created`, `duplicate`, `invalid`, or `error`.

## Verification checklist

- With a properly configured test connector, initialize then call `tools/list`; verify both tools are visible.
- Verify requests with a missing or wrong bearer token receive HTTP 401.
- Call `list_exercise_categories` and confirm current slugs appear.
- Pass an authorized sample original image through a file-capable connector: only then call `import_exercises`.
- Verify the returned saved ID, exercise page, and `image_url` file are correct.
- Ensure duplicate imports do not add extra rows, and checksum mismatch is rejected.
- Do not mark success before checking the stored image and exercise.
