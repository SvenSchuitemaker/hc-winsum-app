import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { captureRef } from "react-native-view-shot";
import { Platform } from "react-native";
import type { ExerciseBoardEditorRef, ExerciseBoardLayout } from "../components/exercise-board/boardTypes";
import { supabase } from "./supabase";

const BUCKET_NAME = "exercise-previews";
// React Native ViewShot calls findNodeHandle and cannot capture DOM nodes on
// React Native Web. Rasterize the actual board DOM instead, including its SVG
// field, player jerseys and arrows, without the reference-photo overlay.
async function captureWebBoard(target: HTMLElement): Promise<string> {
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) throw new Error("Het tekenbord is nog niet zichtbaar.");
    const clone = target.cloneNode(true) as HTMLElement;
    const originalNodes = [target, ...Array.from(target.querySelectorAll("*"))];
    const clonedNodes = [clone, ...Array.from(clone.querySelectorAll("*"))];
    for (let i = 0; i < originalNodes.length; i++) {
        const source = originalNodes[i] as Element;
        const dest = clonedNodes[i] as HTMLElement;
        if (!dest?.style) continue;
        const computed = window.getComputedStyle(source);
        let declaration = "";
        for (let j = 0; j < computed.length; j++) {
            const property = computed[j];
            declaration += property + ":" + computed.getPropertyValue(property) + ";";
        }
        dest.setAttribute("style", declaration);
    }
    // The source photo can remain in the live SVG for overlay checking even
    // when capture mode is switching off. Never serialize external resources:
    // a single cross-origin SVG <image> taints canvas.toDataURL on Chrome.
    // Our field, markers, shirts and arrows are local SVG/DOM vector elements.
    clone.querySelectorAll("image, img, video, canvas, iframe").forEach(node => node.remove());
    clone.querySelectorAll("*").forEach(node => {
        const element = node as HTMLElement;
        if (!element.style) return;
        for (const property of ["background-image", "mask-image", "-webkit-mask-image", "list-style-image", "border-image-source"]) {
            const value = element.style.getPropertyValue(property);
            if (/url\\s*\\(/i.test(value)) element.style.setProperty(property, "none");
        }
    });
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    const xml = new XMLSerializer().serializeToString(clone);
    const width = Math.ceil(rect.width), height = Math.ceil(rect.height);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width +
      '" height="' + height + '"><foreignObject width="100%" height="100%">' +
      xml + '</foreignObject></svg>';
    const url = URL.createObjectURL(new Blob([svg],{type:"image/svg+xml;charset=utf-8"}));
    try {
        const image = new Image();
        await new Promise<void>((resolve,reject)=>{
            image.onload=()=>resolve();
            image.onerror=()=>reject(new Error("Canvas kon niet worden gerenderd."));
            image.src=url;
        });
        const canvas = document.createElement("canvas");
        canvas.width=width*2; canvas.height=height*2;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is niet beschikbaar.");
        context.scale(2,2);
        context.drawImage(image,0,0,width,height);
        try {
            return canvas.toDataURL("image/png").split(",")[1];
        } catch {
            throw new Error("Afbeelding exporteren geblokkeerd door een externe afbeelding. Probeer opnieuw zonder foto-overlay.");
        }
    } finally { URL.revokeObjectURL(url); }
}


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
    // Never include a tracing/reference photo in the saved board preview.
    params.boardRef?.setCaptureMode(true);
    let base64: string;
    try {
        await new Promise((resolve) => setTimeout(resolve, 220));
        if (Platform.OS === "web") {
            base64 = await captureWebBoard(captureTarget as unknown as HTMLElement);
        } else {
            const uri = await captureRef(captureTarget, {
                format: "png", quality: 1, result: "tmpfile",
            });
            base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
            });
        }
    } finally {
        params.boardRef?.setCaptureMode(false);
    }

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