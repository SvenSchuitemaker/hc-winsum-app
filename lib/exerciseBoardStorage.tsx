import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { captureRef } from "react-native-view-shot";
import type { ExerciseBoardEditorRef, ExerciseBoardLayout } from "../components/exercise-board/boardTypes";
import { supabase } from "./supabase";

const BUCKET_NAME = "exercise-previews";

export async function uploadExerciseBoardPreview(params: {
    exerciseId: number;
    title: string;
    boardRef: ExerciseBoardEditorRef | null;
}) {
    if (!supabase) {
        throw new Error("Supabase is niet geladen.");
    }

    const captureTarget = params.boardRef?.getCaptureTarget();

    if (!captureTarget) {
        throw new Error("Geen geldig bord gevonden om een preview van te maken.");
    }

    params.boardRef?.clearSelection();

    await new Promise((resolve) => setTimeout(resolve, 50));

    const uri = await captureRef(captureTarget, {
        format: "png",
        quality: 1,
        result: "tmpfile",
    });

    const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
    });

    const arrayBuffer = decode(base64);
    const safeTitle =
        params.title
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "oefening";

    const filePath = `${params.exerciseId}/${safeTitle}-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, arrayBuffer, {
            contentType: "image/png",
            upsert: true,
        });

    if (uploadError) {
        throw uploadError;
    }

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    return data.publicUrl;
}

export function createEmptyBoardLayout(): ExerciseBoardLayout {
    return {
        fieldMode: "half",
        items: [],
    };
}