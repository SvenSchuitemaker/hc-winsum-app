# ChatGPT hockeyoefeningen import API

The Supabase Edge Function `import-chat-exercises` stores **already recognized** exercises with the **unaltered, original uploaded photo**. It does not run OCR, crop, generate, or redraw images. ChatGPT (or another import client) must prepare the text but send the exact user-uploaded photo bytes, including any page borders or surrounding text. The original photo remains visible as the exercise image so that the user can trace it manually later. Do not claim a photo was saved until the function responds with `status: "created"`.

## Deploy

1. Merge the PR into `main`.
2. In Supabase, configure the `EXERCISE_IMPORT_TOKEN` secret with a cryptographically random value of at least 32 characters. Keep it out of GitHub, app code, screenshots and chats. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase for Edge Functions.
3. Deploy from the repo: `supabase functions deploy import-chat-exercises --project-ref shllbltitjogepjeyxdr --no-verify-jwt`.
4. The function accepts a dedicated `x-import-token` header and performs its own authentication. JWT verification is disabled **only for this function** so server-to-server clients can use the dedicated token.
5. Ensure `exercise-previews` is available as a public Storage bucket, as already expected by the current photo-import feature.
6. Configure a suitable authenticated HTTP connector/action that can call the endpoint from the ChatGPT project. **Project instructions alone cannot grant ChatGPT permission to call arbitrary URLs or automatically install an action.** Keep the token in the connector's secret settings, never in the project instructions.

Endpoint: `https://shllbltitjogepjeyxdr.supabase.co/functions/v1/import-chat-exercises`

## Operations

**GET**: requires `x-import-token`; returns `{ "categories": [{ "slug": "...", "title": "..." }] }`. Use this first to choose a real category.

**POST**: requires `x-import-token`, `Content-Type: application/json`; accepts 1–12 exercises:

```json
{
  "exercises": [{
    "title": "Passen in beweging",
    "category_slug": "REPLACE_WITH_AN_EXISTING_SLUG",
    "subtitle": "Passen en vrijlopen",
    "explanation": "Beschrijving van de oefening.",
    "instructions": "Stap voor stap uitvoeren.",
    "simplify": "Kortere afstand.",
    "build_up": "Meer druk toevoegen.",
    "difficulty": "Gemiddeld",
    "audience": ["JO12", "MO12", "JO14", "MO14"],
    "image": {
      "source": "original_upload",
      "mimeType": "image/jpeg",
      "sha256": "SHA256_HEX_OF_ORIGINAL_IMAGE_BYTES",
      "base64": "BASE64_OF_EXACT_UNMODIFIED_UPLOADED_PHOTO"
    }
  }]
}
```

Allowed `difficulty`: `Makkelijk`, `Gemiddeld`, `Moeilijk`.

Allowed `audience`: `JO8`, `JO10`, `JO12`, `JO14`, `JO16`, `JO18`, `MO8`, `MO10`, `MO12`, `MO14`, `MO16`, `MO18`, `Senioren`.

The image must be the **unaltered original** JPEG, PNG or WebP under 5 MB. Set `source` to `original_upload` and calculate `sha256` over the exact original file bytes. The function verifies this checksum against the decoded upload. This verifies byte integrity, but cannot independently prove the image came from the chat attachment: the connector must use the actual uploaded file, never a generated/reconstructed/board-preview image. Send raw base64 without any data-URL prefix (a correct data URL is also accepted). A full request can contain no more than 42 MB. Text fields are restricted to their configured maximum lengths.

Each result has `status`:
- `created`: Supabase row and image were saved, and the response contains `id`, `image_url` and `exercise_url`.
- `duplicate`: a case-insensitive matching title exists in this category; existing exercise is **not** modified.
- `invalid`: rejected input or unknown category.
- `error`: an upload or database operation failed. An uploaded image is deleted if its row could not be inserted.

Partial success uses HTTP 207 and includes `created`, `duplicates`, `failed` counters. Handle results individually, not just by HTTP status. Existing exercises are never updated or deleted.

## ChatGPT workflow

1. User uploads one or more source photos in ChatGPT.
2. Identify all exercises, pair paragraphs with the right exercise, accurately transcribe text and classify ages and difficulty.
3. Read the original file attachment bytes directly. **Do not crop, generate, redraw, create a mock hockey field, take a screenshot of a rendered board, or substitute another image.** If one page contains multiple exercises, the same original upload can be used for each exercise; do not fabricate distinct images. Compute SHA-256 from the exact original bytes.
4. GET categories and select matching existing slugs.
5. POST the extracted metadata with the original upload bytes, `source: original_upload` and matching `sha256` through the authenticated connector, up to 12 per batch.
6. Report only confirmed `created` results as successfully added; report duplicates and failures separately.

A ChatGPT Project cannot autonomously acquire an integration just from text instructions. If the current project does not have a connector capable of calling this Edge Function with the secret header, the import remains unavailable in that chat until such a connector is configured.

## Smoke checks

- GET with a valid token returns the category list; without a token returns 401.
- POST with one valid cropped image creates one visible exercise with its image.
- Repeating the request returns `duplicate`.
- An unknown category returns `invalid`, with no row/image.
- An invalid image returns `invalid`; corrupt, MIME-mismatched, modified-checksum or non-`original_upload` images are rejected.
- Multiple exercises with one invalid entry save the valid entries and return 207.
- Verify the public `image_url` loads and the exercise page shows the imported text.
- The new function uses service-role credentials only on the server. Do not expose its token to the public web client.

## Preserve photos in the app

For new exercises created with an uploaded photo, the app keeps `image_url` pointing to that original photo even if AI also supplied an editable board layout. Only an exercise created entirely through the manual board editor (without an uploaded photo) generates an automatic preview image. Existing exercise records are not migrated by this change.
