import { Picker } from "@react-native-picker/picker";
import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import ExerciseBoardEditor, {
    type ExerciseBoardEditorRef,
    type ExerciseBoardLayout,
} from "../../components/ExerciseBoardEditor";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import {
    createEmptyBoardLayout,
    uploadExerciseBoardPreview,
} from "../../lib/exerciseBoardStorage";
import { supabase } from "../../lib/supabase";
import { analyzeExercisePhoto, selectExercisePhoto, selectExercisePhotos, uploadExercisePhoto, type SelectedExercisePhoto } from "../../lib/exercisePhotoImport";

type DbCategory = {
    id: number;
    slug: string;
    title: string;
};

const difficultyOptions = ["Makkelijk", "Gemiddeld", "Moeilijk"];
const audienceOptions = [
    "JO8",
    "JO10",
    "JO12",
    "JO14",
    "JO16",
    "JO18",
    "MO8",
    "MO10",
    "MO12",
    "MO14",
    "MO16",
    "MO18",
    "Senioren",
];

export default function NieuweOefeningenScreen() {
    const { role, user } = useAuth();
    const isSuperAdmin = role === "super_admin";
    const boardPreviewRef = useRef<ExerciseBoardEditorRef | null>(null);

    const [categories, setCategories] = useState<DbCategory[]>([]);
    const [categorySlug, setCategorySlug] = useState("");
    const [title, setTitle] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [importPhoto, setImportPhoto] = useState<SelectedExercisePhoto | null>(null);
    const [importMode, setImportMode] = useState<"photo" | "ai">("photo");
    const [analyzing, setAnalyzing] = useState(false);
    const [bulkProgress, setBulkProgress] = useState("");
    const [bulkResults, setBulkResults] = useState<Array<{ file: string; status: "toegevoegd" | "overgeslagen" | "fout"; details: string; id?: number }>>([]);
    const [importError, setImportError] = useState("");
    const [importAudit, setImportAudit] = useState<{ inventory: Record<string, number>; placed: Record<string, number>; warnings: string[]; lineConnections?: Array<{ line: number; from: string; to: string; type: string; status: string }> } | null>(null);
    const [importLayers, setImportLayers] = useState<Record<string, { status: "ok" | "warning" | "empty"; detected: number; placed: number; reason: string }> | null>(null);
    const [boardVersion, setBoardVersion] = useState(0);
    const [subtitle, setSubtitle] = useState("");
    const [explanation, setExplanation] = useState("");
    const [instructions, setInstructions] = useState("");
    const [simplify, setSimplify] = useState("");
    const [buildUp, setBuildUp] = useState("");
    const [difficulty, setDifficulty] = useState("");
    const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
    const [boardLayout, setBoardLayout] = useState<ExerciseBoardLayout>(createEmptyBoardLayout());
    const [loading, setLoading] = useState(false);
    const [loadingCategories, setLoadingCategories] = useState(true);
    const [formError, setFormError] = useState("");
    const [formSuccess, setFormSuccess] = useState("");

    useEffect(() => {
        loadCategories();
    }, []);

    async function loadCategories() {
        try {
            if (!supabase) {
                return;
            }

            const { data, error } = await supabase
                .from("categories")
                .select("id, slug, title")
                .order("title", { ascending: true });

            if (error) {
                throw error;
            }

            const loadedCategories = data || [];
            setCategories(loadedCategories);

            if (loadedCategories.length > 0) {
                setCategorySlug(loadedCategories[0].slug);
            }
        } catch (error) {
            setFormError(error instanceof Error ? error.message : "Categorieën laden mislukt.");
        } finally {
            setLoadingCategories(false);
        }
    }

    async function pickPhoto() {
        try {
            setImportError("");
            const selected = await selectExercisePhoto();
            if (!selected) return;
            setImportPhoto(selected);
            // Do not carry metadata from an earlier uploaded drill into this import.
            setTitle("");
            setSubtitle("");
            setExplanation("");
            setInstructions("");
            setSimplify("");
            setBuildUp("");
            setDifficulty("");
            setSelectedAudiences([]);
            if (categories.length) setCategorySlug(categories[0].slug);
            setImportAudit(null);
        setImportLayers(null);
            setImportLayers(null);
            // A new photo must not reuse objects recognized from a previous photo.
            setBoardLayout({
                ...createEmptyBoardLayout(),
                backgroundImageUrl: selected.uri,
                backgroundOpacity: 0.65,
                backgroundCalibration: {
                    bounds: { left: 0, top: 0, right: 1, bottom: 1 },
                    rotation: 0,
                    flipHorizontal: false,
                },
            });
            setBoardVersion((version) => version + 1);
        } catch (error) {
            setImportError(error instanceof Error ? error.message : "Afbeelding selecteren mislukt.");
        }
    }

    async function importOriginalPhotoAutomatically() {
        if (!isSuperAdmin || !user?.id || !supabase) {
            setImportError("Log in als hoofdbeheerder om een oefening te importeren.");
            return;
        }
        let uploadedUrl: string | null = null;
        try {
            setAnalyzing(true);
            setImportError("");
            setFormSuccess("");
            const photo = await selectExercisePhoto();
            if (!photo) return;

            // The image is sent to the AI only for text recognition, NEVER redrawn.
            const { data, error } = await supabase.functions.invoke("read-exercise-text", {
                body: { mimeType: photo.mimeType, base64: photo.base64 },
            });
            if (error || !data || data.error || typeof data.title !== "string" ||
                !categories.some((category) => category.slug === data.category_slug)) {
                throw new Error(data?.error || "De tekst of categorie kon niet worden herkend.");
            }

            const { data: duplicate, error: duplicateError } = await supabase.from("exercises")
                .select("id").eq("category_slug", data.category_slug).ilike("title", data.title).limit(1);
            if (duplicateError) throw duplicateError;
            if (duplicate?.length) {
                throw new Error("Deze oefening bestaat al (ID " + duplicate[0].id + "). Niet dubbel opgeslagen.");
            }

            uploadedUrl = await uploadExercisePhoto(photo, user.id);
            const { data: saved, error: saveError } = await supabase.from("exercises").insert({
                title: data.title,
                category_slug: data.category_slug,
                image_url: uploadedUrl,
                subtitle: data.subtitle || null,
                explanation: data.explanation || null,
                instructions: data.instructions || null,
                simplify: data.simplify || null,
                build_up: data.build_up || null,
                difficulty: data.difficulty || "Gemiddeld",
                audience: Array.isArray(data.audience) ? data.audience.filter((age: string) => audienceOptions.includes(age)) : [],
                board_layout: null,
            }).select("id, image_url").single();
            if (saveError || !saved?.id || saved.image_url !== uploadedUrl) {
                throw saveError || new Error("Opslag kon niet worden bevestigd.");
            }

            // Check that the original uploaded image is accessible.
            const photoCheck = await fetch(uploadedUrl, { method: "GET" });
            if (!photoCheck.ok) {
                setFormSuccess("Oefening #" + saved.id + " opgeslagen, maar controle van de originele foto mislukte.");
            } else {
                setFormSuccess("Oefening #" + saved.id + " toegevoegd met de originele foto, zonder AI-tekening.");
            }
        } catch (error) {
            setImportError(error instanceof Error ? error.message : "Automatisch importeren mislukt.");
        } finally {
            setAnalyzing(false);
        }
    }

    async function bulkImportPhotos() {
        if (!isSuperAdmin || !user?.id || !supabase || analyzing || loading) return;
        const backend = supabase;
        const uid = user.id;
        setImportError("");
        setBulkResults([]);
        setBulkProgress("");
        // Supabase errors may be plain objects rather than Error instances.
        const errorMessage = (error: unknown): string => {
            if (error instanceof Error) return error.message;
            if (error && typeof error === "object") {
                const e = error as { message?: unknown; details?: unknown; code?: unknown; hint?: unknown };
                const message = [e.message, e.details, e.hint].filter(v => typeof v === "string" && v).join(" — ");
                if (message) return [message, e.code ? "(" + e.code + ")" : ""].filter(Boolean).join(" ");
            }
            return typeof error === "string" ? error : "Onbekende fout.";
        };
        let photos: SelectedExercisePhoto[];
        try { photos = await selectExercisePhotos(); }
        catch (error) { setImportError(errorMessage(error)); return; }
        if (!photos.length) return;
        setAnalyzing(true);
        const results: Array<{file:string;status:"toegevoegd"|"overgeslagen"|"fout";details:string;id?:number}> = [];
        try {
            // Check the new database migration BEFORE spending Gemini tokens.
            const { error:conceptTableError } = await backend.from("exercise_concepts").select("id").limit(1);
            if (conceptTableError) {
                throw new Error("Concepten zijn nog niet beschikbaar in Supabase: " +
                    errorMessage(conceptTableError) +
                    ". Voer de migratie 20261021121900_exercise_concepts.sql uit en probeer opnieuw.");
            }
            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i], file = "Foto " + (i + 1);
                let stage = "Bestand controleren";
                setBulkProgress("AI tekent " + (i + 1) + " van " + photos.length + "…");
                try {
                    if (!["image/jpeg","image/png","image/webp"].includes(photo.mimeType) ||
                        photo.base64.length < 20 || photo.base64.length > 7_000_000)
                        throw new Error("Ongeldig fotoformaat of groter dan 5 MB.");
                    stage = "Gemini-tekening";
                    const drawing = await analyzeExercisePhoto(photo);
                    if (!drawing.board_layout.items.length) throw new Error("Geen tekenobjecten herkend.");
                    let metadata: Record<string, any> = {};
                    stage = "Tekstherkenning";
                    try {
                        const {data,error} = await backend.functions.invoke("read-exercise-text", {
                            body:{mimeType:photo.mimeType,base64:photo.base64}
                        });
                        if (!error && data && !data.error) metadata=data;
                    } catch { /* Keep the drawing when metadata extraction fails. */ }
                    const slug = categories.some(c=>c.slug===metadata.category_slug)
                        ? String(metadata.category_slug) : categorySlug;
                    if (!slug) throw new Error("Geen categorie beschikbaar.");
                    stage = "Originele foto uploaden";
                    const sourceImageUrl=await uploadExercisePhoto(photo,uid);
                    stage = "Privéconcept opslaan";
                    const {error}=await backend.from("exercise_concepts").insert({
                        user_id:uid,title:String(metadata.title||drawing.title||file).trim(),
                        category_slug:slug,source_image_url:sourceImageUrl,
                        board_layout:{...drawing.board_layout,backgroundImageUrl:null,backgroundCalibration:drawing.field_calibration ?? drawing.board_layout.backgroundCalibration},
                        subtitle:metadata.subtitle||drawing.subtitle||null,
                        explanation:metadata.explanation||drawing.explanation||null,
                        instructions:metadata.instructions||drawing.instructions||null,
                        simplify:metadata.simplify||null,build_up:metadata.build_up||null,
                        difficulty:difficultyOptions.includes(metadata.difficulty)?metadata.difficulty:"Gemiddeld",
                        audience:Array.isArray(metadata.audience)?metadata.audience.filter((v:string)=>audienceOptions.includes(v)):[],
                        status:"ready"
                    });
                    if(error)throw error;
                    results.push({file,status:"toegevoegd",details:"Concept: "+String(metadata.title||drawing.title||file)});
                } catch(error) {
                    const message = stage + ": " + errorMessage(error);
                    results.push({file,status:"fout",details:message});
                    // Authorization, missing table and storage configuration errors
                    // cannot be fixed by trying another image. Avoid repeated costs.
                    const code = error && typeof error === "object" && "code" in error
                        ? String((error as {code?:unknown}).code ?? "") : "";
                    if (["42P01","42501","PGRST205","PGRST204","PGRST116"].includes(code) ||
                        /row.level.security|permission denied|relation .* does not exist|schema cache/i.test(message)) {
                        setBulkResults([...results]);
                        setImportError("Import gestopt: " + message);
                        break;
                    }
                }
                setBulkResults([...results]);
            }
            setBulkProgress("Klaar: "+results.filter(r=>r.status==="toegevoegd").length+" concepten, "+
                results.filter(r=>r.status==="fout").length+" mislukt.");
        } catch(error) {
            setImportError(errorMessage(error));
            setBulkProgress("Import niet gestart. Er zijn geen nieuwe AI-analyses uitgevoerd.");
        } finally {setAnalyzing(false);}
    }

    async function analyzePhoto() {
        if (!importPhoto || !supabase) return;
        try {
            setAnalyzing(true);
            setImportError("");
            // Both analyses use the same source image: diagram placement and complete
            // trainer-facing exercise metadata are independent of each other.
            const [drawing, metadata] = await Promise.allSettled([
                analyzeExercisePhoto(importPhoto),
                supabase.functions.invoke("read-exercise-text", {
                    body: { mimeType: importPhoto.mimeType, base64: importPhoto.base64 },
                }),
            ]);

            if (drawing.status === "fulfilled") {
                const result = drawing.value;
                setImportAudit(result.import_audit ?? null);
                setImportLayers(result.layers ?? null);
                setBoardLayout({
                    ...result.board_layout,
                    backgroundImageUrl: importPhoto.uri,
                    backgroundCalibration: result.field_calibration,
                    backgroundOpacity: 0.65,
                });
                setBoardVersion((version) => version + 1);
            } else {
                setImportLayers(null);
                setImportAudit(null);
            }

            const metadataData = metadata.status === "fulfilled" &&
                !metadata.value.error && !metadata.value.data?.error
                ? metadata.value.data : null;

            if (metadataData && categories.some((category) => category.slug === metadataData.category_slug)) {
                setCategorySlug(metadataData.category_slug);
                if (metadataData.title) setTitle(metadataData.title);
                if (metadataData.subtitle) setSubtitle(metadataData.subtitle);
                if (metadataData.explanation) setExplanation(metadataData.explanation);
                if (metadataData.instructions) setInstructions(metadataData.instructions);
                if (metadataData.simplify) setSimplify(metadataData.simplify);
                if (metadataData.build_up) setBuildUp(metadataData.build_up);
                if (difficultyOptions.includes(metadataData.difficulty)) setDifficulty(metadataData.difficulty);
                if (Array.isArray(metadataData.audience)) {
                    setSelectedAudiences(metadataData.audience.filter((value: string) => audienceOptions.includes(value)));
                }
                const missing = Array.isArray(metadataData.missing_fields) ? metadataData.missing_fields : [];
                if (missing.length) {
                    setImportError("AI kon niet alle velden invullen (" + missing.join(", ") +
                        "). Controleer en vul deze handmatig aan.");
                }
            } else if (drawing.status === "fulfilled") {
                const result = drawing.value;
                if (result.title) setTitle(result.title);
                if (result.subtitle) setSubtitle(result.subtitle);
                if (result.explanation) setExplanation(result.explanation);
                if (result.instructions) setInstructions(result.instructions);
                setImportError("Het tekenbord is gemaakt, maar de overige tekstvelden konden niet automatisch worden ingevuld.");
            }

            if (drawing.status === "rejected") {
                const drawingMessage = drawing.reason instanceof Error ? drawing.reason.message : "AI-tekening mislukt.";
                setImportError("Bewerkbare tekening kon niet worden gemaakt: " + drawingMessage);
            } else if (!drawing.value.board_layout.items.length) {
                setImportError("Geen herkenbare tekenobjecten. De tekstvelden zijn waar mogelijk wel ingevuld.");
            }
            if (drawing.status === "rejected" && !metadataData) {
                throw drawing.reason;
            }
        } catch (error) {
            setImportError(error instanceof Error ? error.message : "AI-analyse mislukt.");
        } finally {
            setAnalyzing(false);
        }
    }

    function toggleAudience(audience: string) {
        setSelectedAudiences((current) =>
            current.includes(audience)
                ? current.filter((item) => item !== audience)
                : [...current, audience]
        );
    }

    function resetForm() {
        setTitle("");
        setImageUrl("");
        setFormError("");
        setImportPhoto(null);
        setImportAudit(null);
        setImportError("");
        setBoardVersion((version) => version + 1);
        setSubtitle("");
        setExplanation("");
        setInstructions("");
        setSimplify("");
        setBuildUp("");
        setDifficulty("");
        setSelectedAudiences([]);
        setBoardLayout(createEmptyBoardLayout());
    }

    async function handleSave() {
        if (!isSuperAdmin) {
            setFormError("Alleen super admins kunnen oefeningen toevoegen.");
            return;
        }

        if (!categorySlug || !title.trim()) {
            setFormError("Kies een categorie en vul een titel in.");
            return;
        }

        if (!difficulty) {
            setFormError("Kies een moeilijkheid.");
            return;
        }

        try {
            setLoading(true);
            setFormError("");
            setFormSuccess("");

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            if (importPhoto && importMode === "ai" && boardLayout.items.length === 0) {
                throw new Error("Laat de foto eerst met AI analyseren of kies 'Originele foto'.");
            }
            const hasBoardItems = boardLayout.items.length > 0 && (!importPhoto || importMode === "ai");
            let savedImageUrl = imageUrl.trim() || null;
            if (importPhoto) {
                if (!user?.id) throw new Error("Log in om een foto toe te voegen.");
                // Keep the uploaded original as fallback if a generated board preview fails.
                savedImageUrl = await uploadExercisePhoto(importPhoto, user.id);
            }

            const { data: insertedExercise, error: insertError } = await supabase
                .from("exercises")
                .insert({
                    category_slug: categorySlug,
                    title: title.trim(),
                    image_url: hasBoardItems ? null : savedImageUrl,
                    subtitle: subtitle.trim() || null,
                    explanation: explanation.trim() || null,
                    instructions: instructions.trim() || null,
                    simplify: simplify.trim() || null,
                    build_up: buildUp.trim() || null,
                    difficulty,
                    audience: selectedAudiences,
                    board_layout: hasBoardItems ? {
                        ...boardLayout,
                        // The photo is only a temporary alignment aid, never part of the final board.
                        backgroundImageUrl: importPhoto && importMode === "ai" ? null : boardLayout.backgroundImageUrl,
                    } : null,
                })
                .select("id")
                .single();

            if (insertError) throw insertError;

            // Never mark a drawn exercise as saved if its generated image failed.
            if (hasBoardItems && insertedExercise?.id) {
                try {
                    if (!boardPreviewRef.current) throw new Error("Het tekenbord is nog niet gereed.");
                    const previewUrl = await uploadExerciseBoardPreview({
                        exerciseId: insertedExercise.id,
                        title: title.trim(),
                        boardRef: boardPreviewRef.current,
                        boardLayout,
                    });
                    if (!previewUrl || previewUrl.includes("/imports/"))
                        throw new Error("De getekende bordafbeelding ontbreekt.");
                    const { error: updateError } = await supabase
                        .from("exercises").update({ image_url: previewUrl })
                        .eq("id", insertedExercise.id);
                    if (updateError) throw updateError;
                } catch (previewError) {
                    const { error: rollbackError } = await supabase
                        .from("exercises").delete().eq("id", insertedExercise.id);
                    if (rollbackError)
                        throw new Error("Bordpreview mislukt en het terugdraaien van de oefening mislukte: " + rollbackError.message);
                    throw previewError;
                }
            }

            resetForm();
            setFormSuccess("De oefening is toegevoegd aan de bibliotheek.");
        } catch (error) {
            setFormError(error instanceof Error ? error.message : "Opslaan mislukt.");
        } finally {
            setLoading(false);
        }
    }

    if (!isSuperAdmin) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Geen toegang</Text>
                <Text style={styles.text}>
                    Alleen super admins kunnen nieuwe oefeningen toevoegen.
                </Text>
            </View>
        );
    }

    if (loadingCategories) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                <Text style={styles.title}>Nieuwe oefening toevoegen</Text>
                {!!formSuccess && <Text style={styles.successText}>{formSuccess}</Text>}
                {!!formError && <Text style={styles.importError}>{formError}</Text>}

                <Text style={styles.label}>Categorie</Text>
                <View style={styles.pickerWrap}>
                    <Picker
                        selectedValue={categorySlug}
                        onValueChange={(value) => setCategorySlug(value)}
                        dropdownIconColor="#111111"
                        style={styles.picker}
                    >
                        {categories.map((category) => (
                            <Picker.Item
                                key={category.id}
                                label={category.title}
                                value={category.slug}
                                color="#111111"
                            />
                        ))}
                    </Picker>
                </View>

                <Text style={styles.label}>Titel</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Titel"
                    placeholderTextColor={COLORS.mutedText}
                    value={title}
                    onChangeText={setTitle}
                />

                <View style={styles.importBox}>
                    <Text style={styles.label}>Foto importeren</Text>
                    <Pressable style={styles.importButton} onPress={() => void bulkImportPhotos()} disabled={loading || analyzing}>
                        <Text style={styles.buttonText}>20 afbeeldingen kiezen</Text>
                    </Pressable>
                    <Text style={styles.helpText}>
                        Selecteer maximaal 20 foto's. Gemini tekent ze één voor één als privéconcept. Publiceren gebeurt pas na jouw goedkeuring.
                    </Text>
                    <Pressable style={styles.importButton} onPress={() => router.push("/concepten" as never)} disabled={analyzing}>
                        <Text style={styles.buttonText}>Concepten bekijken en goedkeuren</Text>
                    </Pressable>
                    {!!bulkProgress && <Text style={styles.helpText}>{bulkProgress}</Text>}
                    {bulkResults.map((result, index) => (
                        <View key={index} style={{ marginTop: 6 }}>
                            <Text style={styles.helpText}>
                                {result.file}: {result.status} — {result.details}
                            </Text>
                            {result.id != null && (
                                <Pressable onPress={() => router.push(`/exercise/${result.id}`)}>
                                    <Text style={{ color: COLORS.primaryLight }}>Bekijk oefening #{result.id}</Text>
                                </Pressable>
                            )}
                        </View>
                    ))}

                    <Pressable
                        style={styles.importButton}
                        onPress={() => void importOriginalPhotoAutomatically()}
                        disabled={loading || analyzing}
                    >
                        {analyzing
                            ? <ActivityIndicator color={COLORS.text} />
                            : <Text style={styles.buttonText}>AI: foto herkennen en direct opslaan</Text>}
                    </Pressable>
                    <Text style={styles.helpText}>
                        Kies één foto: AI leest de oefening, kiest categorie en leeftijden,
                        en bewaart uitsluitend de originele afbeelding. Het tekenbord blijft leeg.
                    </Text>

                    <Text style={styles.helpText}>Kies een bestaande hockeyoefening uit je galerij. Gebruik de originele foto of laat AI een bewerkbaar bord voorstellen.</Text>
                    <View style={styles.importModes}>
                        <Pressable style={[styles.modeButton, importMode === "photo" && styles.modeSelected]} onPress={() => setImportMode("photo")}>
                            <Text style={styles.buttonText}>Originele foto</Text>
                        </Pressable>
                        <Pressable style={[styles.modeButton, importMode === "ai" && styles.modeSelected]} onPress={() => setImportMode("ai")}>
                            <Text style={styles.buttonText}>AI natekenen</Text>
                        </Pressable>
                    </View>
                    <Pressable style={styles.importButton} onPress={pickPhoto} disabled={loading || analyzing}>
                        <Text style={styles.buttonText}>Foto kiezen</Text>
                    </Pressable>
                    {importPhoto && <Image source={{ uri: importPhoto.uri }} style={styles.importPreview} resizeMode="contain" />}
                    {importPhoto && importMode === "ai" && (
                        <Pressable style={styles.importButton} onPress={analyzePhoto} disabled={analyzing || loading}>
                            {analyzing ? <ActivityIndicator color={COLORS.text} /> : <Text style={styles.buttonText}>Analyseer en teken na met AI</Text>}
                        </Pressable>
                    )}
                    {!!importError && <Text style={styles.importError}>{importError}</Text>}
                    {importMode === "ai" && importLayers && (
                        <View style={{ marginTop: 12, gap: 8 }}>
                            <Text style={styles.label}>Controle per AI-laag</Text>
                            {([
                                ["cones", "1. Pylonnen"],
                                ["team1", "2. Team 1"],
                                ["team2", "3. Team 2"],
                                ["trainer", "4. Trainer"],
                                ["passLines", "5. Passlijnen"],
                                ["runLines", "6. Looplijnen"],
                                ["supportPlayers", "7. Steunspelers"],
                            ] as const).map(([key, title]) => {
                                const layer = importLayers[key];
                                if (!layer) return null;
                                return (
                                    <View key={key} style={{ marginBottom: 4 }}>
                                        <Text style={styles.helpText}>{title}: {layer.placed}/{layer.detected} geplaatst — {layer.status === "ok" ? "Geplaatst" : layer.status === "empty" ? "Niet herkend" : "Controle nodig"}</Text>
                                        {!!layer.reason && <Text style={styles.importError}>{layer.reason}</Text>}
                                    </View>
                                );
                            })}
                        </View>
                    )}
                    {importMode === "ai" && importAudit && (
                        <View style={{ marginTop: 12, gap: 6 }}>
                            <Text style={styles.helpText}>AI-inventarisatie (controleer met de originele foto):</Text>
                            {Object.entries(importAudit.placed).map(([type, count]) => (
                                <Text key={type} style={styles.helpText}>
                                    {type}: {count} geplaatst{importAudit.inventory[type] !== undefined ? ` / ${importAudit.inventory[type]} herkend` : ""}
                                </Text>
                            ))}
                            <Text style={styles.label}>Herkende lijnen en verbindingen</Text>
                            {(importAudit.lineConnections ?? []).map((line) => (
                                <Text key={line.line} style={styles.helpText}>
                                    {`${line.line}. ${line.from} → ${line.to} (${line.type === "runLine" ? "looplijn" : "passlijn"}; ${line.status})`}
                                </Text>
                            ))}
                            {!importAudit.lineConnections?.length && (
                                <Text style={styles.helpText}>Geen afzonderlijke spelerverbindingen beschikbaar.</Text>
                            )}
                            {importAudit.warnings.map((warning, index) => (
                                <Text key={index} style={styles.importError}>{warning}</Text>
                            ))}
                        </View>
                    )}
                    {importMode === "ai" && <Text style={styles.helpText}>Als je analyseert, wordt de foto naar onze beveiligde Supabase-functie en een AI-dienst verzonden. Dit kan API-kosten veroorzaken. Controleer en corrigeer de onderdelen hieronder voordat je opslaat.</Text>}
                </View>

                <Text style={styles.label}>Afbeelding URL (optioneel)</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Afbeelding URL"
                    placeholderTextColor={COLORS.mutedText}
                    value={imageUrl}
                    onChangeText={setImageUrl}
                />
                <Text style={styles.helpText}>
                    Laat dit leeg als je de preview van het tekenbord als afbeelding wilt gebruiken.
                </Text>

                <Text style={styles.label}>Subtitel</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Subtitel"
                    placeholderTextColor={COLORS.mutedText}
                    value={subtitle}
                    onChangeText={setSubtitle}
                />

                <Text style={styles.label}>Uitleg</Text>
                <TextInput
                    style={[styles.input, styles.textarea]}
                    multiline
                    placeholder="Uitleg"
                    placeholderTextColor={COLORS.mutedText}
                    value={explanation}
                    onChangeText={setExplanation}
                />

                <Text style={styles.label}>Instructies</Text>
                <TextInput
                    style={[styles.input, styles.textarea]}
                    multiline
                    placeholder="Instructies"
                    placeholderTextColor={COLORS.mutedText}
                    value={instructions}
                    onChangeText={setInstructions}
                />

                <Text style={styles.label}>Vereenvoudiging</Text>
                <TextInput
                    style={[styles.input, styles.textarea]}
                    multiline
                    placeholder="Vereenvoudiging"
                    placeholderTextColor={COLORS.mutedText}
                    value={simplify}
                    onChangeText={setSimplify}
                />

                <Text style={styles.label}>Uitbouw</Text>
                <TextInput
                    style={[styles.input, styles.textarea]}
                    multiline
                    placeholder="Uitbouw"
                    placeholderTextColor={COLORS.mutedText}
                    value={buildUp}
                    onChangeText={setBuildUp}
                />

                <Text style={styles.label}>Moeilijkheid</Text>
                <View style={styles.pickerWrap}>
                    <Picker
                        selectedValue={difficulty}
                        onValueChange={(value) => setDifficulty(value)}
                        dropdownIconColor="#111111"
                        style={styles.picker}
                    >
                        <Picker.Item label="Kies moeilijkheid" value="" color="#111111" />
                        {difficultyOptions.map((option) => (
                            <Picker.Item key={option} label={option} value={option} color="#111111" />
                        ))}
                    </Picker>
                </View>

                <Text style={styles.label}>Doelgroepen</Text>
                <View style={styles.audienceWrap}>
                    {audienceOptions.map((audience) => {
                        const selected = selectedAudiences.includes(audience);

                        return (
                            <Pressable
                                key={audience}
                                style={[
                                    styles.audienceButton,
                                    selected && styles.audienceButtonSelected,
                                ]}
                                onPress={() => toggleAudience(audience)}
                            >
                                <Text
                                    style={[
                                        styles.audienceText,
                                        selected && styles.audienceTextSelected,
                                    ]}
                                >
                                    {audience}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            <ExerciseBoardEditor
                key={boardVersion}
                ref={boardPreviewRef}
                value={boardLayout}
                onChange={setBoardLayout}
            />

            <View style={styles.card}>
                {!!formError && <Text style={styles.importError}>{formError}</Text>}
                <Pressable style={styles.button} onPress={handleSave} disabled={loading || analyzing}>
                    {loading ? (
                        <ActivityIndicator color={COLORS.text} />
                    ) : (
                        <Text style={styles.buttonText}>Opslaan</Text>
                    )}
                </Pressable>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    importBox: { borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, borderRadius: RADIUS.lg, marginBottom: SPACING.md },
    importModes: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.md },
    modeButton: { backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, flex: 1, padding: 9, alignItems: "center" },
    modeSelected: { borderColor: COLORS.primaryLight, backgroundColor: COLORS.primary },
    importButton: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: "center", marginBottom: SPACING.md },
    importPreview: { width: "100%", height: 220, marginBottom: SPACING.md },
    importError: { color: "#F47777", marginBottom: SPACING.md },
    successText: { color: "#74D49B", fontSize: 14, fontWeight: "700", marginBottom: SPACING.md },
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { padding: SPACING.md, paddingBottom: SPACING.xxl },
    center: {
        flex: 1,
        backgroundColor: COLORS.background,
        justifyContent: "center",
        alignItems: "center",
        padding: SPACING.md,
    },
    card: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.md,
    },
    title: {
        color: COLORS.text,
        fontSize: 24,
        fontWeight: "900",
        marginBottom: 16,
    },
    text: {
        color: COLORS.mutedText,
        fontSize: 16,
        lineHeight: 24,
        textAlign: "center",
    },
    label: {
        color: COLORS.primaryLight,
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 8,
        marginTop: 4,
    },
    input: {
        backgroundColor: COLORS.surfaceLight,
        color: COLORS.text,
        borderRadius: RADIUS.md,
        paddingHorizontal: 14,
        paddingVertical: 14,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    helpText: {
        color: COLORS.mutedText,
        fontSize: 13,
        lineHeight: 20,
        marginTop: -6,
        marginBottom: SPACING.md,
    },
    textarea: {
        minHeight: 100,
        textAlignVertical: "top",
    },
    pickerWrap: {
        backgroundColor: "#F3F6FA",
        borderRadius: RADIUS.md,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: "hidden",
    },
    picker: {
        color: "#111111",
        backgroundColor: "#F3F6FA",
    },
    audienceWrap: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: SPACING.sm,
    },
    audienceButton: {
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.pill,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    audienceButtonSelected: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    audienceText: {
        color: COLORS.text,
        fontWeight: "700",
    },
    audienceTextSelected: {
        color: "#FFFFFF",
    },
    button: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        alignItems: "center",
    },
    buttonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 16,
    },
});