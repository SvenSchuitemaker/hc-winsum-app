import { Picker } from "@react-native-picker/picker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
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

type DbCategory = {
    id: number;
    slug: string;
    title: string;
};

type DbExercise = {
    id: number;
    category_slug: string;
    title: string;
    image_url: string | null;
    subtitle: string | null;
    explanation: string | null;
    instructions: string | null;
    simplify: string | null;
    build_up: string | null;
    difficulty: string | null;
    audience: string[];
    board_layout: ExerciseBoardLayout | null;
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

export default function ExerciseBewerkScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user, role, loading: authLoading } = useAuth();
    const boardPreviewRef = useRef<ExerciseBoardEditorRef | null>(null);

    const [categories, setCategories] = useState<DbCategory[]>([]);
    const [categorySlug, setCategorySlug] = useState("");
    const [title, setTitle] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [explanation, setExplanation] = useState("");
    const [instructions, setInstructions] = useState("");
    const [simplify, setSimplify] = useState("");
    const [buildUp, setBuildUp] = useState("");
    const [difficulty, setDifficulty] = useState("");
    const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
    const [boardLayout, setBoardLayout] = useState<ExerciseBoardLayout>(createEmptyBoardLayout());
    const [regenerateBoardPreview, setRegenerateBoardPreview] = useState(false);
    const [boardChanged, setBoardChanged] = useState(false);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const isAdmin = role === "super_admin";

    useEffect(() => {
        if (authLoading) return;

        if (!user || !isAdmin) {
            setLoading(false);
            return;
        }

        loadData();
    }, [id, user, isAdmin, authLoading]);

    async function loadData() {
        try {
            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const [{ data: categoryData, error: categoryError }, { data: exerciseData, error: exerciseError }] =
                await Promise.all([
                    supabase.from("categories").select("id, slug, title").order("title", { ascending: true }),
                    supabase.from("exercises").select("*").eq("id", Number(id)).single(),
                ]);

            if (categoryError) throw categoryError;
            if (exerciseError) throw exerciseError;

            const categoriesLoaded = (categoryData as DbCategory[]) || [];
            const exercise = exerciseData as DbExercise;

            setCategories(categoriesLoaded);
            setCategorySlug(exercise.category_slug || "");
            setTitle(exercise.title || "");
            setImageUrl(exercise.image_url || "");
            setSubtitle(exercise.subtitle || "");
            setExplanation(exercise.explanation || "");
            setInstructions(exercise.instructions || "");
            setSimplify(exercise.simplify || "");
            setBuildUp(exercise.build_up || "");
            setDifficulty(exercise.difficulty || "");
            setSelectedAudiences(exercise.audience || []);
            setBoardLayout(exercise.board_layout || createEmptyBoardLayout());
            setRegenerateBoardPreview(false);
            setBoardChanged(false);
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Oefening laden mislukt."
            );
            router.back();
        } finally {
            setLoading(false);
        }
    }

    function toggleAudience(audience: string) {
        setSelectedAudiences((current) =>
            current.includes(audience)
                ? current.filter((item) => item !== audience)
                : [...current, audience]
        );
    }

    const handleBoardChange = useCallback((nextLayout: ExerciseBoardLayout) => {
        setBoardLayout((currentLayout) => {
            const currentSerialized = JSON.stringify(currentLayout);
            const nextSerialized = JSON.stringify(nextLayout);

            if (currentSerialized === nextSerialized) {
                return currentLayout;
            }

            setBoardChanged(true);
            return nextLayout;
        });
    }, []);

    async function handleSave() {
        if (!user || !isAdmin) {
            Alert.alert("Geen toegang", "Alleen admins mogen oefeningen bewerken.");
            return;
        }

        if (!categorySlug || !title.trim()) {
            Alert.alert("Ontbrekende velden", "Kies een categorie en vul een titel in.");
            return;
        }

        if (!difficulty) {
            Alert.alert("Ontbrekende velden", "Kies een moeilijkheid.");
            return;
        }

        try {
            setSaving(true);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const hasBoardItems = boardLayout.items.length > 0;

            const shouldGenerateBoardPreview =
                hasBoardItems &&
                !!boardPreviewRef.current &&
                (regenerateBoardPreview || boardChanged || !imageUrl.trim());

            let nextImageUrl = imageUrl.trim() || null;

            if (shouldGenerateBoardPreview) {
                nextImageUrl = await uploadExerciseBoardPreview({
                    exerciseId: Number(id),
                    title: title.trim(),
                    boardRef: boardPreviewRef.current,
                });
            }

            const { error } = await supabase
                .from("exercises")
                .update({
                    category_slug: categorySlug,
                    title: title.trim(),
                    image_url: nextImageUrl,
                    subtitle: subtitle.trim() || null,
                    explanation: explanation.trim() || null,
                    instructions: instructions.trim() || null,
                    simplify: simplify.trim() || null,
                    build_up: buildUp.trim() || null,
                    difficulty,
                    audience: selectedAudiences,
                    board_layout: hasBoardItems ? boardLayout : null,
                })
                .eq("id", Number(id));

            if (error) throw error;

            setImageUrl(nextImageUrl || "");
            setBoardChanged(false);
            setRegenerateBoardPreview(false);

            Alert.alert("Gelukt", "De oefening is bijgewerkt.");
            router.replace(`/exercise/${id}`);
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Opslaan mislukt."
            );
        } finally {
            setSaving(false);
        }
    }

    if (authLoading || loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (!user) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Geen toegang</Text>
                <Text style={styles.text}>Log in om oefeningen te bewerken.</Text>
            </View>
        );
    }

    if (!isAdmin) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Geen toegang</Text>
                <Text style={styles.text}>Alleen admins mogen oefeningen bewerken.</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                <Text style={styles.title}>Oefening bewerken</Text>

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

                <Text style={styles.label}>Afbeelding URL (optioneel)</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Afbeelding URL"
                    placeholderTextColor={COLORS.mutedText}
                    value={imageUrl}
                    onChangeText={(value) => {
                        setImageUrl(value);
                        if (value.trim()) {
                            setRegenerateBoardPreview(false);
                        }
                    }}
                />
                <Text style={styles.helpText}>
                    Laat dit leeg om de preview van het tekenbord als afbeelding te gebruiken, of kies
                    hieronder om de afbeelding opnieuw vanuit het tekenbord te genereren.
                </Text>

                <Pressable
                    style={[
                        styles.toggleButton,
                        regenerateBoardPreview && styles.toggleButtonActive,
                    ]}
                    onPress={() => {
                        setRegenerateBoardPreview((current) => !current);
                        if (!regenerateBoardPreview) {
                            setImageUrl("");
                        }
                    }}
                >
                    <Text
                        style={[
                            styles.toggleButtonText,
                            regenerateBoardPreview && styles.toggleButtonTextActive,
                        ]}
                    >
                        {regenerateBoardPreview
                            ? "Preview van tekenbord wordt opnieuw gegenereerd"
                            : "Afbeelding opnieuw genereren vanuit tekenbord"}
                    </Text>
                </Pressable>

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
                            <Picker.Item
                                key={option}
                                label={option}
                                value={option}
                                color="#111111"
                            />
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
                ref={boardPreviewRef}
                value={boardLayout}
                onChange={handleBoardChange}
            />

            <View style={styles.card}>
                <Pressable style={styles.button} onPress={handleSave} disabled={saving}>
                    {saving ? (
                        <ActivityIndicator color={COLORS.text} />
                    ) : (
                        <Text style={styles.buttonText}>Wijzigingen opslaan</Text>
                    )}
                </Pressable>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
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
        marginBottom: SPACING.lg,
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
    toggleButton: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.md,
        paddingVertical: 12,
        paddingHorizontal: 14,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.md,
    },
    toggleButtonActive: {
        backgroundColor: COLORS.primary + "22",
        borderColor: COLORS.primary,
    },
    toggleButtonText: {
        color: COLORS.text,
        fontWeight: "700",
        textAlign: "center",
    },
    toggleButtonTextActive: {
        color: COLORS.primaryLight,
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