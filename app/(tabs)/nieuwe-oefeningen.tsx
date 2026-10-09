import { Picker } from "@react-native-picker/picker";
import { useEffect, useRef, useState } from "react";
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
import { analyzeExercisePhoto, selectExercisePhoto, uploadExercisePhoto, type SelectedExercisePhoto } from "../../lib/exercisePhotoImport";

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
    const [importError, setImportError] = useState("");
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
            // A new photo must not reuse objects recognized from a previous photo.
            setBoardLayout(createEmptyBoardLayout());
            setBoardVersion((version) => version + 1);
        } catch (error) {
            setImportError(error instanceof Error ? error.message : "Afbeelding selecteren mislukt.");
        }
    }

    async function analyzePhoto() {
        if (!importPhoto) return;
        try {
            setAnalyzing(true);
            setImportError("");
            const result = await analyzeExercisePhoto(importPhoto);
            if (result.title) setTitle(result.title);
            if (result.subtitle) setSubtitle(result.subtitle);
            if (result.explanation) setExplanation(result.explanation);
            if (result.instructions) setInstructions(result.instructions);
            setBoardLayout({
                ...result.board_layout,
                backgroundImageUrl: importPhoto.uri,
                backgroundOpacity: 0.65,
            });
            setBoardVersion((version) => version + 1);
            if (!result.board_layout.items.length) {
                setImportError("Geen herkenbare tekenobjecten gevonden. Je kunt de foto wel rechtstreeks opslaan.");
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
                    image_url: savedImageUrl,
                    subtitle: subtitle.trim() || null,
                    explanation: explanation.trim() || null,
                    instructions: instructions.trim() || null,
                    simplify: simplify.trim() || null,
                    build_up: buildUp.trim() || null,
                    difficulty,
                    audience: selectedAudiences,
                    board_layout: hasBoardItems ? {
                        ...boardLayout,
                        backgroundImageUrl: importPhoto && importMode === "ai" ? savedImageUrl : boardLayout.backgroundImageUrl,
                    } : null,
                })
                .select("id")
                .single();

            if (insertError) throw insertError;

            let previewFailed = false;
            if (hasBoardItems && insertedExercise?.id && boardPreviewRef.current) {
                try {
                    const previewUrl = await uploadExerciseBoardPreview({
                        exerciseId: insertedExercise.id,
                        title: title.trim(),
                        boardRef: boardPreviewRef.current,
                    });

                    const { error: updateError } = await supabase
                        .from("exercises")
                        .update({ image_url: previewUrl })
                        .eq("id", insertedExercise.id);

                    if (updateError) throw updateError;
                } catch {
                    // The exercise already exists: keep its original photo, when available.
                    previewFailed = true;
                }
            }

            resetForm();
            setFormSuccess(previewFailed
                ? "Oefening opgeslagen, maar de bordpreview kon niet worden gemaakt. Open de oefening om de afbeelding te controleren."
                : "De oefening is toegevoegd aan de bibliotheek.");
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