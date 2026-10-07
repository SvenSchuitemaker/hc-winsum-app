import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, {
    DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type ExerciseOption = {
    id: number;
    title: string;
};

type TeamOption = {
    id: number;
    name: string;
};

type TrainingData = {
    id: number;
    title: string;
    training_date: string | null;
    team_id: number | null;
    warmup_exercise_id: number | null;
    warmup_duration: number;
    main_exercise_id: number | null;
    main_duration: number;
    match_exercise_id: number | null;
    match_duration: number;
};

type TrainingBlockRow = {
    position: number;
    title: string;
    exercise_id: number | null;
    duration: number;
    notes: string | null;
};

type BlockDraft = {
    localId: string;
    title: string;
    exerciseId: string;
    duration: string;
    notes: string;
};

function makeLocalId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDateForDisplay(date: Date | null) {
    if (!date) return "";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

function formatDateForDatabase(date: Date | null) {
    if (!date) return null;
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
}

function parseDatabaseDate(dateString: string | null) {
    if (!dateString) return null;
    const [year, month, day] = dateString.split("-");
    if (!year || !month || !day) return null;
    return new Date(Number(year), Number(month) - 1, Number(day));
}

export default function TrainingBewerkScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();

    const [title, setTitle] = useState("");
    const [trainingDate, setTrainingDate] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [teams, setTeams] = useState<TeamOption[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<string>("");

    const [allExercises, setAllExercises] = useState<ExerciseOption[]>([]);
    const [favoriteExercises, setFavoriteExercises] = useState<ExerciseOption[]>([]);
    const [exerciseSource, setExerciseSource] = useState<"all" | "favorites">("all");

    const [blocks, setBlocks] = useState<BlockDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const exercises = useMemo(() => {
        return exerciseSource === "favorites" ? favoriteExercises : allExercises;
    }, [exerciseSource, favoriteExercises, allExercises]);

    useEffect(() => {
        loadAll();
    }, [id, user]);

    async function loadAll() {
        try {
            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const [
                { data: teamsData, error: teamsError },
                { data: exerciseData, error: exerciseError },
                { data: trainingData, error: trainingError },
                { data: blockData, error: blockError },
            ] = await Promise.all([
                supabase.from("teams").select("id, name").order("name", { ascending: true }),
                supabase.from("exercises").select("id, title").order("title", { ascending: true }),
                supabase
                    .from("trainings")
                    .select(`
            id,
            title,
            training_date,
            team_id,
            warmup_exercise_id,
            warmup_duration,
            main_exercise_id,
            main_duration,
            match_exercise_id,
            match_duration
          `)
                    .eq("id", Number(id))
                    .single(),
                supabase
                    .from("training_blocks")
                    .select("position, title, exercise_id, duration, notes")
                    .eq("training_id", Number(id))
                    .order("position", { ascending: true }),
            ]);

            if (teamsError) throw teamsError;
            if (exerciseError) throw exerciseError;
            if (trainingError) throw trainingError;
            if (blockError) throw blockError;

            const loadedTeams = (teamsData as TeamOption[]) || [];
            const loadedExercises = (exerciseData as ExerciseOption[]) || [];

            setTeams(loadedTeams);
            setAllExercises(loadedExercises);

            if (user) {
                const { data: favoriteData, error: favoriteError } = await supabase
                    .from("favorites")
                    .select(`
            exercises (
              id,
              title
            )
          `)
                    .eq("user_id", user.id);

                if (favoriteError) throw favoriteError;

                const mappedFavorites =
                    favoriteData?.map((item: any) => item.exercises).filter(Boolean) ?? [];

                setFavoriteExercises(mappedFavorites);
            } else {
                setFavoriteExercises([]);
            }

            const training = trainingData as TrainingData;
            const trainingBlocks = (blockData as TrainingBlockRow[]) || [];
            const fallbackExerciseId = loadedExercises[0] ? String(loadedExercises[0].id) : "";

            setTitle(training.title || "");
            setTrainingDate(parseDatabaseDate(training.training_date));
            setSelectedTeamId(training.team_id ? String(training.team_id) : "");

            if (trainingBlocks.length > 0) {
                setBlocks(
                    trainingBlocks.map((block) => ({
                        localId: makeLocalId(),
                        title: block.title,
                        exerciseId: block.exercise_id ? String(block.exercise_id) : fallbackExerciseId,
                        duration: String(block.duration ?? 0),
                        notes: block.notes || "",
                    }))
                );
            } else {
                setBlocks([
                    {
                        localId: makeLocalId(),
                        title: "Warm-up",
                        exerciseId: training.warmup_exercise_id
                            ? String(training.warmup_exercise_id)
                            : fallbackExerciseId,
                        duration: String(training.warmup_duration ?? 10),
                        notes: "",
                    },
                    {
                        localId: makeLocalId(),
                        title: "Oefening",
                        exerciseId: training.main_exercise_id
                            ? String(training.main_exercise_id)
                            : fallbackExerciseId,
                        duration: String(training.main_duration ?? 20),
                        notes: "",
                    },
                    {
                        localId: makeLocalId(),
                        title: "Eindpartij",
                        exerciseId: training.match_exercise_id
                            ? String(training.match_exercise_id)
                            : fallbackExerciseId,
                        duration: String(training.match_duration ?? 20),
                        notes: "",
                    },
                ]);
            }
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Training laden mislukt."
            );
            router.back();
        } finally {
            setLoading(false);
        }
    }

    function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
        if (Platform.OS === "android") {
            setShowDatePicker(false);
        }

        if (event.type === "dismissed") return;

        if (selectedDate) {
            setTrainingDate(selectedDate);
        }
    }

    function updateBlock(localId: string, field: keyof BlockDraft, value: string) {
        setBlocks((current) =>
            current.map((block) =>
                block.localId === localId ? { ...block, [field]: value } : block
            )
        );
    }

    function addBlock() {
        const fallbackExerciseId = exercises[0] ? String(exercises[0].id) : "";

        setBlocks((current) => [
            ...current,
            {
                localId: makeLocalId(),
                title: `Onderdeel ${current.length + 1}`,
                exerciseId: fallbackExerciseId,
                duration: "10",
                notes: "",
            },
        ]);
    }

    function removeBlock(localId: string) {
        setBlocks((current) => current.filter((block) => block.localId !== localId));
    }

    function moveBlock(localId: string, direction: "up" | "down") {
        setBlocks((current) => {
            const index = current.findIndex((block) => block.localId === localId);
            if (index === -1) return current;

            const nextIndex = direction === "up" ? index - 1 : index + 1;
            if (nextIndex < 0 || nextIndex >= current.length) return current;

            const copy = [...current];
            const [item] = copy.splice(index, 1);
            copy.splice(nextIndex, 0, item);

            return copy;
        });
    }

    async function handleSave() {
        if (!title.trim()) {
            Alert.alert("Ontbrekende titel", "Geef je training een naam.");
            return;
        }

        if (!selectedTeamId) {
            Alert.alert("Geen team", "Kies eerst een team.");
            return;
        }

        const validBlocks = blocks.filter(
            (block) => block.title.trim() && block.exerciseId.trim()
        );

        if (validBlocks.length === 0) {
            Alert.alert("Geen onderdelen", "Voeg minstens één geldig trainingsonderdeel toe.");
            return;
        }

        try {
            setSaving(true);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const first = validBlocks[0];
            const second = validBlocks[1];
            const third = validBlocks[2];

            const { error: updateError } = await supabase
                .from("trainings")
                .update({
                    title: title.trim(),
                    training_date: formatDateForDatabase(trainingDate),
                    team_id: Number(selectedTeamId),
                    warmup_exercise_id: first?.exerciseId ? Number(first.exerciseId) : null,
                    warmup_duration: Number(first?.duration || 0),
                    main_exercise_id: second?.exerciseId ? Number(second.exerciseId) : null,
                    main_duration: Number(second?.duration || 0),
                    match_exercise_id: third?.exerciseId ? Number(third.exerciseId) : null,
                    match_duration: Number(third?.duration || 0),
                })
                .eq("id", Number(id));

            if (updateError) throw updateError;

            const { error: deleteBlocksError } = await supabase
                .from("training_blocks")
                .delete()
                .eq("training_id", Number(id));

            if (deleteBlocksError) throw deleteBlocksError;

            const { error: insertBlocksError } = await supabase.from("training_blocks").insert(
                validBlocks.map((block, index) => ({
                    training_id: Number(id),
                    position: index + 1,
                    title: block.title.trim(),
                    exercise_id: Number(block.exerciseId),
                    duration: Number(block.duration) || 0,
                    notes: block.notes.trim() || null,
                }))
            );

            if (insertBlocksError) throw insertBlocksError;

            Alert.alert("Gelukt", "Training bijgewerkt.");
            router.replace(`/training/${id}`);
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Bijwerken mislukt."
            );
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                <Text style={styles.title}>Training bewerken</Text>

                <Text style={styles.label}>Naam training</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Naam training"
                    placeholderTextColor={COLORS.mutedText}
                    value={title}
                    onChangeText={setTitle}
                />

                <Text style={styles.label}>Team</Text>
                <View style={styles.pickerWrap}>
                    <Picker
                        selectedValue={selectedTeamId}
                        onValueChange={(value) => setSelectedTeamId(String(value))}
                        dropdownIconColor="#111111"
                        style={styles.picker}
                    >
                        {teams.map((team) => (
                            <Picker.Item
                                key={team.id}
                                label={team.name}
                                value={String(team.id)}
                                color="#111111"
                            />
                        ))}
                    </Picker>
                </View>

                <Text style={styles.label}>Datum</Text>
                <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                    <Text style={styles.dateButtonText}>
                        {trainingDate ? formatDateForDisplay(trainingDate) : "Kies een datum"}
                    </Text>
                </Pressable>

                {showDatePicker && (
                    <DateTimePicker
                        value={trainingDate ?? new Date()}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        onChange={handleDateChange}
                    />
                )}

                <Text style={styles.label}>Bron oefeningen</Text>
                <View style={styles.filterRow}>
                    <Pressable
                        style={[
                            styles.filterButton,
                            exerciseSource === "all" && styles.filterButtonSelected,
                        ]}
                        onPress={() => setExerciseSource("all")}
                    >
                        <Text
                            style={[
                                styles.filterButtonText,
                                exerciseSource === "all" && styles.filterButtonTextSelected,
                            ]}
                        >
                            Alle oefeningen
                        </Text>
                    </Pressable>

                    <Pressable
                        style={[
                            styles.filterButton,
                            exerciseSource === "favorites" && styles.filterButtonSelected,
                        ]}
                        onPress={() => setExerciseSource("favorites")}
                    >
                        <Text
                            style={[
                                styles.filterButtonText,
                                exerciseSource === "favorites" && styles.filterButtonTextSelected,
                            ]}
                        >
                            Alleen favorieten
                        </Text>
                    </Pressable>
                </View>

                {exerciseSource === "favorites" && favoriteExercises.length === 0 && (
                    <Text style={styles.warningText}>
                        Je hebt nog geen favorieten. Voeg eerst oefeningen toe aan je favorieten.
                    </Text>
                )}

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Trainingsonderdelen</Text>
                    <Pressable style={styles.smallButton} onPress={addBlock}>
                        <Text style={styles.smallButtonText}>Onderdeel toevoegen</Text>
                    </Pressable>
                </View>

                {blocks.map((block, index) => (
                    <View key={block.localId} style={styles.blockCard}>
                        <View style={styles.blockTopRow}>
                            <Text style={styles.blockNumber}>Onderdeel {index + 1}</Text>

                            <View style={styles.blockActions}>
                                <Pressable
                                    style={styles.iconButton}
                                    onPress={() => moveBlock(block.localId, "up")}
                                >
                                    <Ionicons name="arrow-up-outline" size={18} color={COLORS.text} />
                                </Pressable>

                                <Pressable
                                    style={styles.iconButton}
                                    onPress={() => moveBlock(block.localId, "down")}
                                >
                                    <Ionicons name="arrow-down-outline" size={18} color={COLORS.text} />
                                </Pressable>

                                <Pressable
                                    style={styles.deleteIconButton}
                                    onPress={() => removeBlock(block.localId)}
                                    disabled={blocks.length <= 1}
                                >
                                    <Ionicons name="trash-outline" size={18} color="#C0392B" />
                                </Pressable>
                            </View>
                        </View>

                        <TextInput
                            style={styles.input}
                            placeholder="Titel onderdeel"
                            placeholderTextColor={COLORS.mutedText}
                            value={block.title}
                            onChangeText={(value) => updateBlock(block.localId, "title", value)}
                        />

                        <View style={styles.pickerWrap}>
                            <Picker
                                selectedValue={block.exerciseId}
                                onValueChange={(value) =>
                                    updateBlock(block.localId, "exerciseId", String(value))
                                }
                                dropdownIconColor="#111111"
                                style={styles.picker}
                            >
                                {exercises.map((exercise) => (
                                    <Picker.Item
                                        key={exercise.id}
                                        label={exercise.title}
                                        value={String(exercise.id)}
                                        color="#111111"
                                    />
                                ))}
                            </Picker>
                        </View>

                        <TextInput
                            style={styles.input}
                            placeholder="Duur in minuten"
                            placeholderTextColor={COLORS.mutedText}
                            keyboardType="numeric"
                            value={block.duration}
                            onChangeText={(value) => updateBlock(block.localId, "duration", value)}
                        />

                        <TextInput
                            style={[styles.input, styles.textarea]}
                            placeholder="Notities voor dit onderdeel"
                            placeholderTextColor={COLORS.mutedText}
                            multiline
                            value={block.notes}
                            onChangeText={(value) => updateBlock(block.localId, "notes", value)}
                        />
                    </View>
                ))}

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
    },
    title: {
        color: COLORS.text,
        fontSize: 24,
        fontWeight: "900",
        marginBottom: 10,
    },
    label: {
        color: COLORS.primaryLight,
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 8,
    },
    sectionHeader: {
        marginTop: SPACING.sm,
        marginBottom: SPACING.md,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
    },
    sectionTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "800",
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
    textarea: {
        minHeight: 90,
        textAlignVertical: "top",
    },
    dateButton: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.md,
        paddingHorizontal: 14,
        paddingVertical: 14,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    dateButtonText: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "600",
    },
    filterRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: SPACING.md,
    },
    filterButton: {
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.pill,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    filterButtonSelected: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    filterButtonText: {
        color: COLORS.text,
        fontWeight: "700",
    },
    filterButtonTextSelected: {
        color: "#FFFFFF",
    },
    warningText: {
        color: COLORS.mutedText,
        fontSize: 14,
        lineHeight: 22,
        marginBottom: SPACING.md,
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
    blockCard: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: SPACING.md,
        marginBottom: SPACING.md,
    },
    blockTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: SPACING.md,
        gap: 12,
    },
    blockNumber: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "800",
    },
    blockActions: {
        flexDirection: "row",
        gap: 8,
    },
    iconButton: {
        width: 38,
        height: 38,
        borderRadius: 10,
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: "center",
        justifyContent: "center",
    },
    deleteIconButton: {
        width: 38,
        height: 38,
        borderRadius: 10,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: "#C0392B",
        alignItems: "center",
        justifyContent: "center",
    },
    button: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        alignItems: "center",
        marginTop: 4,
    },
    smallButton: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
        alignItems: "center",
    },
    buttonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 16,
    },
    smallButtonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 13,
    },
});