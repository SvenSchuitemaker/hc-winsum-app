import { Platform } from "react-native";
import type { SelectedExercisePhoto } from "./exercisePhotoImport";

export type PixelPoint = { x: number; y: number };

/**
 * Detect saturated red cone icons on a green coaching diagram using the
 * original pixels. No vision-model coordinate guessing is involved.
 * Unsupported platforms and images return null so AI remains the fallback.
 */
export async function detectRedCones(photo: SelectedExercisePhoto): Promise<PixelPoint[] | null> {
    if (Platform.OS !== "web" || typeof document === "undefined") return null;
    const image = new window.Image();
    image.src = `data:${photo.mimeType};base64,${photo.base64}`;
    try {
        await image.decode();
    } catch {
        return null;
    }
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    if (!naturalWidth || !naturalHeight) return null;
    const scale = Math.min(1, 1100 / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    // Both red cone outlines and deep-red interiors qualify, but dark-red
    // numbered player circles are filtered by component geometry.
    for (let i = 0; i < mask.length; i++) {
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
        if (r > 95 && r > g * 1.5 && r > b * 1.45 && g < 155) mask[i] = 1;
    }
    const result: PixelPoint[] = [];
    const queue = new Int32Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        let head = 0, tail = 1;
        queue[0] = i;
        mask[i] = 0;
        let minX = width, maxX = 0, minY = height, maxY = 0;
        let pixels = 0, sx = 0, sy = 0;
        while (head < tail) {
            const at = queue[head++];
            const x = at % width, y = Math.floor(at / width);
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            pixels++; sx += x; sy += y;
            const adjacent = [at - 1, at + 1, at - width, at + width];
            for (let d = 0; d < 4; d++) {
                if ((d === 0 && x === 0) || (d === 1 && x === width - 1) ||
                    (d === 2 && y === 0) || (d === 3 && y === height - 1)) continue;
                const next = adjacent[d];
                if (mask[next]) { mask[next] = 0; queue[tail++] = next; }
            }
        }
        const bw = maxX - minX + 1, bh = maxY - minY + 1;
        const ratio = bh / bw;
        const area = bw * bh;
        const fill = pixels / area;
        // Tall standing cones only: exclude large red player circles, specks,
        // horizontal field decorations and tiny compression artifacts.
        if (pixels < 35 || pixels > 1600 || bw < 5 || bh < 10 ||
            ratio < 1.12 || ratio > 3.5 || fill < 0.18 || fill > 0.9 ||
            bw > width * 0.065 || bh > height * 0.095) continue;
        result.push({ x: sx / pixels / width, y: sy / pixels / height });
    }
    // Returning [] when zero candidates means no reliable pixel detections.
    // Leave the original AI result untouched in that situation.
    return result.length ? result : null;
}
