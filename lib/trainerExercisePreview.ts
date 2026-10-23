import { supabase } from "./supabase";

export async function getTrainerExercisePreviewUrl(path: string | null | undefined): Promise<string | null> {
    if (!supabase || !path) return null;
    const { data, error } = await supabase.storage
        .from("trainer-exercise-previews")
        .createSignedUrl(path, 60 * 60);
    return error ? null : data?.signedUrl || null;
}
