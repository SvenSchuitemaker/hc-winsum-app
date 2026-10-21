import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { captureRef } from "react-native-view-shot";
import { Platform } from "react-native";
import type { ExerciseBoardEditorRef, ExerciseBoardLayout } from "../components/exercise-board/boardTypes";
import { supabase } from "./supabase";
import { buildItemLabels } from "../components/exercise-board/boardUtils";

const BUCKET_NAME = "exercise-previews";
// React Native ViewShot calls findNodeHandle and cannot capture DOM nodes on
// React Native Web. Rasterize the actual board DOM instead, including its SVG
// field, player jerseys and arrows, without the reference-photo overlay.
async function captureWebBoard(target: HTMLElement, layout: ExerciseBoardLayout): Promise<string> {
    const board = target.querySelector("svg");
    if (!board) throw new Error("Geen SVG-tekenveld gevonden.");
    const rect = board.getBoundingClientRect();
    if (!rect.width || !rect.height) throw new Error("Het tekenveld is nog niet zichtbaar.");
    const width = Math.ceil(rect.width), height = Math.ceil(rect.height);
    const canvas = document.createElement("canvas");
    canvas.width = width * 2; canvas.height = height * 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas niet beschikbaar.");
    context.scale(2, 2);
    // Render only native SVG primitives. foreignObject is not origin-clean
    // in mobile browsers, even after removing all external images.
    const vector = board.cloneNode(true) as SVGSVGElement;
    vector.querySelectorAll("image, foreignObject, script").forEach(node => node.remove());
    vector.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    vector.setAttribute("width", String(width));
    vector.setAttribute("height", String(height));
    const source = new XMLSerializer().serializeToString(vector);
    const imageUrl = URL.createObjectURL(new Blob([source], {type: "image/svg+xml;charset=utf-8"}));
    try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("Veldlijnen kunnen niet worden gerenderd."));
            image.src = imageUrl;
        });
        context.drawImage(image, 0, 0, width, height);
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
    const shirtColors: Record<string,string> = {
        black:"#171717", orange:"#F39A25", blue:"#199ED8", grey:"#A5A5A5",
        white:"#F5F5F5", red:"#D93945", green:"#2EAD72",
    };
    const path = new Path2D("M 7 2.5 L 9 3.7 Q 11 5.3 13 3.7 L 15 2.5 L 21 6.5 L 18 12 L 15.9 10.9 L 15.9 20 L 6.1 20 L 6.1 10.9 L 4 12 L 1 6.5 Z");
    const itemLabels = buildItemLabels(layout.items);
    for (const item of layout.items) {
        if (["passLine","runLine","guideLine"].includes(item.type)) continue;
        const x = item.x * width, y = item.y * height;
        context.save(); context.translate(x, y);
        const shirt = item.type === "player" ||
            (["attacker","defender","trainer"].includes(item.type) && !!item.shirtColor);
        if (shirt) {
            context.translate(-11,-11);
            context.fillStyle = shirtColors[item.shirtColor || "blue"] || shirtColors.blue;
            context.strokeStyle = item.shirtColor === "white" ? "#555" : "#ECECEC";
            context.lineWidth = 0.85;
            context.fill(path); context.stroke(path);
            context.font = "900 7px Arial"; context.textAlign = "center";
            context.fillStyle = ["white","orange","grey"].includes(item.shirtColor || "") ? "#111" : "#FFF";
            context.fillText(String(itemLabels[item.id] ?? item.label ?? (item.type === "trainer" ? "T" : "")),11,16);
        } else if (item.type === "cone") {
            context.fillStyle = "#FF8A3D"; context.beginPath();
            context.moveTo(0,-7); context.lineTo(-6,5); context.lineTo(6,5); context.closePath(); context.fill();
        } else if (item.type === "ball") {
            context.beginPath(); context.arc(0,0,4.5,0,Math.PI*2);
            context.fillStyle="#FFF"; context.fill();context.strokeStyle="#111";context.lineWidth=1.5;context.stroke();
        } else if (item.type === "hat") {
            context.beginPath();context.arc(0,0,6,0,Math.PI*2);
            context.fillStyle=shirtColors[item.color || "orange"] || "#FFD166";context.fill();
        } else if (item.type === "text") {
            context.font="700 10px Arial";context.textAlign="center";context.fillStyle="#FFF";
            context.fillText(String(item.text || ""),0,0);
        } else if (item.type === "goal") {
            context.rotate((item.rotation || 0)*Math.PI/180);
            context.strokeStyle="#FFF";context.lineWidth=2;
            context.beginPath();context.moveTo(-10,-7);context.lineTo(-10,7);
            context.lineTo(10,7);context.lineTo(10,-7);context.stroke();
        } else {
            context.beginPath();context.arc(0,0,9,0,Math.PI*2);
            context.fillStyle=item.type==="defender"?"#FF5A5F":item.type==="trainer"?"#FFF":"#1735FF";
            context.fill();context.fillStyle=item.type==="trainer"?"#1B3555":"#FFF";
            context.font="900 7px Arial";context.textAlign="center";
            context.fillText(String(item.label||""),0,2.5);
        }
        context.restore();
    }
    return canvas.toDataURL("image/png").split(",")[1];
}

export async function uploadExerciseBoardPreview(params: {
    exerciseId: number;
    title: string;
    boardRef: ExerciseBoardEditorRef | null;
    boardLayout?: ExerciseBoardLayout;
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
            if (!params.boardLayout) throw new Error("Tekenbordgegevens ontbreken voor web-export.");
            base64 = await captureWebBoard(captureTarget as unknown as HTMLElement, params.boardLayout);
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