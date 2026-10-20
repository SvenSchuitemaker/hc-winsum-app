import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";
import { detectRedCones, detectPlayerCenters } from "./exercisePixelDetection";
import type { ExerciseBoardLayout } from "../components/exercise-board/boardTypes";

const SUPPORTED = ["image/jpeg", "image/png", "image/webp"];

export type SelectedExercisePhoto = {
    uri: string;
    base64: string;
    mimeType: string;
};

export type ExercisePhotoAnalysis = {
    title: string;
    subtitle: string;
    explanation: string;
    instructions: string;
    board_layout: ExerciseBoardLayout;
    field_calibration?: { bounds: { left: number; top: number; right: number; bottom: number }; rotation: number; flipHorizontal: boolean };
    layers?: Record<string, { status: "ok" | "warning" | "empty"; detected: number; placed: number; reason: string; items: ExerciseBoardLayout["items"] }>;
    import_audit?: {
        inventory: Record<string, number>;
        placed: Record<string, number>;
        warnings: string[];
        lineConnections?: Array<{ line: number; from: string; to: string; type: string; status: string }>;
    };
};

export async function selectExercisePhoto(): Promise<SelectedExercisePhoto | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.9,
        base64: true,
    });
    if (result.canceled || !result.assets.length) return null;
    const asset = result.assets[0];
    const mimeType = asset.mimeType || "image/jpeg";
    if (!SUPPORTED.includes(mimeType)) {
        throw new Error("Kies een JPG-, PNG- of WebP-afbeelding.");
    }
    if (!asset.base64) {
        throw new Error("De afbeelding kan niet worden ingelezen. Probeer een andere afbeelding.");
    }
    if (asset.base64.length > 7_000_000) {
        throw new Error("De foto is te groot. Gebruik een afbeelding kleiner dan 5 MB.");
    }
    return { uri: asset.uri, mimeType, base64: asset.base64 };
}

/** Select up to 20 photos for sequential AI OCR and original-photo upload. */
export async function selectExercisePhotos(): Promise<SelectedExercisePhoto[]> {
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 20,
        orderedSelection: true,
        quality: 1,
        base64: true,
    });
    if (result.canceled) return [];
    const selected: SelectedExercisePhoto[] = [];
    for (const asset of result.assets) {
        const mimeType = asset.mimeType || "image/jpeg";
        // Reject unsupported / oversized files individually during bulk import.
        selected.push({ uri: asset.uri, mimeType, base64: asset.base64 || "" });
    }
    return selected;
}

export async function uploadExercisePhoto(photo: SelectedExercisePhoto, userId: string) {
    if (!supabase) throw new Error("Supabase is niet geladen.");
    const extension = photo.mimeType === "image/png" ? "png" : photo.mimeType === "image/webp" ? "webp" : "jpg";
    const path = `imports/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const { error } = await supabase.storage.from("exercise-previews").upload(path, decode(photo.base64), {
        contentType: photo.mimeType,
        upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("exercise-previews").getPublicUrl(path);
    return data.publicUrl;
}

export async function analyzeExercisePhoto(photo: SelectedExercisePhoto): Promise<ExercisePhotoAnalysis> {
    if (!supabase) throw new Error("Supabase is niet geladen.");
    // Detect real pixel centers in the ORIGINAL photo. The backend only uses
    // these as position evidence for an existing AI inventory item.
    const [detectedCones, detectedPlayers] = await Promise.all([
        detectRedCones(photo),
        detectPlayerCenters(photo),
    ]);
    const { data, error } = await supabase.functions.invoke("analyze-exercise-photo", {
        body: { mimeType: photo.mimeType, base64: photo.base64, detectedCones, detectedPlayers },
    });
    if (error) {
        const context = (error as { context?: unknown }).context;
        const response = context && typeof context === "object" && "status" in context
            ? context as Response : null;
        let message = response
            ? `AI-server gaf HTTP ${response.status}. Probeer opnieuw of controleer de Supabase-functielogs.`
            : "Geen verbinding met de AI-server. Controleer internetverbinding en probeer opnieuw.";
        if (response && typeof response.json === "function") {
            try {
                const body = await response.json();
                if (typeof body?.error === "string") message = body.error;
            } catch {
                // Keep the HTTP status, even if the gateway sent a non-JSON error.
            }
        } else if (context instanceof Error) {
            message = `AI-verzoek kon niet worden verstuurd: ${context.message}`;
        }
        throw new Error(message);
    }
    if (!data || typeof data !== "object" || data.error) {
        throw new Error(data?.error || "AI-analyse mislukt.");
    }
    if (!data.board_layout || !Array.isArray(data.board_layout.items)) {
        throw new Error("AI heeft geen geldig bewerkbaar bord teruggegeven.");
    }
    // Normalize the imported board itself, not just its appearance. This
    // keeps grey playing jerseys black even if the deployed Edge Function
    // is an older version; trainer T and other colors remain unchanged.
    const analysis = data as ExercisePhotoAnalysis;
    return {
        ...analysis,
        board_layout: {
            ...analysis.board_layout,
            items: analysis.board_layout.items.map((item) =>
                item.type === "player" &&
                item.shirtColor === "grey" &&
                String(item.label ?? "").trim().toUpperCase() !== "T"
                    ? { ...item, shirtColor: "black" as const }
                    : item
            ),
        },
    };
}
