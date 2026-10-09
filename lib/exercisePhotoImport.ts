import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";
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
    const { data, error } = await supabase.functions.invoke("analyze-exercise-photo", {
        body: { mimeType: photo.mimeType, base64: photo.base64 },
    });
    if (error) throw new Error("AI-analyse is niet beschikbaar. Controleer of de Edge Function is gedeployed.");
    if (!data || typeof data !== "object" || data.error) {
        throw new Error(data?.error || "AI-analyse mislukt.");
    }
    if (!data.board_layout || !Array.isArray(data.board_layout.items)) {
        throw new Error("AI heeft geen geldig bewerkbaar bord teruggegeven.");
    }
    return data as ExercisePhotoAnalysis;
}
