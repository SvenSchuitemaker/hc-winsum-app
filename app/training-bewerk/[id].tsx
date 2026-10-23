import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, {
    DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ImageBackground,
    Modal,
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
import TrainingStartTimePicker from "../../components/TrainingStartTimePicker";
import { takeCreatedTrainerExercise } from "../../lib/trainerExerciseSelection";
import { getTrainerExercisePreviewUrl } from "../../lib/trainerExercisePreview";

type ExerciseOption = {
    id: number | string;
    isConcept?: boolean;
    title: string;
    category_slug: string;
    image_url: string | null;
};

type CategoryOption = {
    slug: string;
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
    start_time?: string | null;
    is_prepared?: boolean;
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
    concept_id?: string | null;
    is_break?: boolean;
    duration: number;
    notes: string | null;
};

type BlockDraft = {
    isBreak?: boolean;
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
    const [startTime, setStartTime] = useState("");
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [teams, setTeams] = useState<TeamOption[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<string>("");

    const [categories, setCategories] = useState<CategoryOption[]>([]);
    const [allExercises, setAllExercises] = useState<ExerciseOption[]>([]);
    const [favoriteExercises, setFavoriteExercises] = useState<ExerciseOption[]>([]);
    const [ownExercises, setOwnExercises] = useState<ExerciseOption[]>([]);
    const [exerciseAddedMessage, setExerciseAddedMessage] = useState(false);
    const [exerciseSource, setExerciseSource] = useState<"all" | "favorites" | "own">("all");
    const [exerciseSelectorBlockId, setExerciseSelectorBlockId] = useState<string | null>(null);
    const [exerciseCategoryFilter, setExerciseCategoryFilter] = useState<string>("all");

    const [blocks, setBlocks] = useState<BlockDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");

    const exercises = useMemo(() => {
        return exerciseSource === "favorites" ? favoriteExercises : exerciseSource === "own" ? ownExercises : allExercises;
    }, [exerciseSource, favoriteExercises, ownExercises, allExercises]);

    const selectorExercises = useMemo(() => {
        if (exerciseCategoryFilter === "all") return exercises;
        return exercises.filter((exercise) => exercise.category_slug === exerciseCategoryFilter);
    }, [exerciseCategoryFilter, exercises]);

    useFocusEffect(useCallback(() => {
        let active = true;
        async function refreshOwn() {
            if (!supabase || !user?.id) return;
            const result = await supabase.from("exercise_concepts")
                .select("id, title, category_slug, status, published_exercise_id, preview_image_path")
                .eq("user_id", user.id).in("status", ["ready", "rejected"]).order("created_at", { ascending: false });
            let data: any[] = result.data || [];
            let error = result.error;
            if (error) {
                // Keep existing concepts selectable until the preview migration is installed.
                const fallback = await supabase.from("exercise_concepts")
                    .select("id, title, category_slug, status, published_exercise_id")
                    .eq("user_id", user.id).in("status", ["ready", "rejected"]).order("created_at", { ascending: false });
                if (!fallback.error) { data = fallback.data || []; error = null; }
            }
            if (!active) return;
            if (error) { Alert.alert("Eigen oefeningen laden mislukt", error.message); return; }
            const ownRows = (data || []).filter(row => row.status === "ready" && !row.published_exercise_id);
            const previews = await Promise.all(ownRows.map(row => getTrainerExercisePreviewUrl(row.preview_image_path)));
            if (!active) return;
            setOwnExercises(ownRows.map((row, index) => ({
                id: `concept:${row.id}`, title: row.title, category_slug: row.category_slug,
                image_url: previews[index], isConcept: true,
            })));
            const created = takeCreatedTrainerExercise();
            if (created) {
                setBlocks(current => current.map(block => block.localId === created.blockId
                    ? { ...block, exerciseId: `concept:${created.conceptId}` } : block));
                setExerciseAddedMessage(true);
                setExerciseSource("own");
                setExerciseCategoryFilter("all");
            }
        }
        void refreshOwn();
        return () => { active = false; };
    }, [user?.id]));

    const selectedExerciseBlock = useMemo(() => {
        if (!exerciseSelectorBlockId) return null;
        return blocks.find((block) => block.localId === exerciseSelectorBlockId) ?? null;
    }, [blocks, exerciseSelectorBlockId]);

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
                { data: categoryData, error: categoryError },
                { data: exerciseData, error: exerciseError },
                { data: trainingData, error: trainingError },
                { data: initialBlockData, error: initialBlockError },
            ] = await Promise.all([
                supabase.from("teams").select("id, name").order("name", { ascending: true }),
                supabase.from("categories").select("slug, title").order("id", { ascending: true }),
                supabase
                    .from("exercises")
                    .select("id, title, category_slug, image_url")
                    .order("title", { ascending: true }),
                supabase
                    .from("trainings")
                    .select(`
            id,
            title,
            training_date,
            start_time,
            is_prepared,
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
                    .select("position, title, exercise_id, concept_id, is_break, duration, notes")
                    .eq("training_id", Number(id))
                    .order("position", { ascending: true }),
            ]);

            let blockData: any = initialBlockData;
            let blockError: any = initialBlockError;
            if (blockError) {
                // Backwards compatibility while the private-concepts migration is pending.
                const legacy = await supabase.from("training_blocks")
                    .select("position, title, exercise_id, duration, notes")
                    .eq("training_id", Number(id)).order("position", { ascending: true });
                if (!legacy.error) { blockData = legacy.data; blockError = null; }
            }

            if (teamsError) throw teamsError;
            if (categoryError) throw categoryError;
            if (exerciseError) throw exerciseError;
            if (trainingError) throw trainingError;
            if (blockError) throw blockError;

            const loadedTeams = (teamsData as TeamOption[]) || [];
            const loadedCategories = (categoryData as CategoryOption[]) || [];
            const loadedExercises = (exerciseData as ExerciseOption[]) || [];

            setTeams(loadedTeams);
            setCategories(loadedCategories);
            setAllExercises(loadedExercises);

            if (user) {
                const { data: favoriteData, error: favoriteError } = await supabase
                    .from("favorites")
                    .select(`
            exercises (
              id,
              title,
              category_slug,
              image_url
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
            setStartTime(training.start_time?.slice(0,5) || "");
            setSelectedTeamId(training.team_id ? String(training.team_id) : "");

            if (trainingBlocks.length > 0) {
                setBlocks(
                    trainingBlocks.map((block) => ({
                        localId: makeLocalId(),
                        title: block.title,
                        isBreak: !!block.is_break,
                        exerciseId: block.is_break ? "" : block.concept_id ? `concept:${block.concept_id}` : block.exercise_id ? String(block.exercise_id) : fallbackExerciseId,
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

    function openExerciseSelector(localId: string) {
        setExerciseSelectorBlockId(localId);
        setExerciseCategoryFilter("all");
    }

    function selectExercise(exercise: ExerciseOption) {
        if (!exerciseSelectorBlockId) return;
        updateBlock(exerciseSelectorBlockId, "exerciseId", String(exercise.id));
        setExerciseSelectorBlockId(null);
        setExerciseCategoryFilter("all");
    }

    function getSelectedExercise(exerciseId: string) {
        return [...allExercises, ...ownExercises].find((exercise) => String(exercise.id) === exerciseId) ?? null;
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

    function addBreak() {
        setBlocks(current => [...current, {
            localId: makeLocalId(), isBreak: true, title: "Pauze / veld klaarzetten",
            exerciseId: "", duration: "5", notes: "Tijd om de volgende oefening klaar te zetten.",
        }]);
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

    function publishedId(value: string | undefined) { return value && !value.startsWith("concept:") ? Number(value) : null; }
    function conceptId(value: string | undefined) { return value?.startsWith("concept:") ? value.slice(8) : null; }

    async function handleSave(asDraft = false) {
        setSaveError("");
        if (!title.trim()) {
            Alert.alert("Ontbrekende titel", "Geef je training een naam.");
            return;
        }

        if (!selectedTeamId) {
            Alert.alert("Geen team", "Kies eerst een team.");
            return;
        }

        const validBlocks = blocks.filter(
            (block) => block.title.trim() && (block.isBreak || block.exerciseId.trim())
        );

        if (!asDraft && !validBlocks.some(block => !block.isBreak)) {
            Alert.alert("Geen onderdelen", "Voeg minstens één geldig trainingsonderdeel toe.");
            return;
        }

        if (!trainingDate || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(startTime)) {
            Alert.alert("Datum en tijd ontbreken", "Vul de trainingsdatum en begintijd in voor de herinneringen.");
            return;
        }
        try {
            setSaving(true);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const { error: conceptSchemaError } = await supabase.from("training_blocks").select("concept_id").limit(0);
            if (conceptSchemaError && validBlocks.some(block => conceptId(block.exerciseId))) {
                throw new Error("Eigen oefeningen kunnen nog niet worden opgeslagen: de Supabase-migratie voor concept_id ontbreekt. De bestaande training is niet gewijzigd.");
            }

            const exerciseBlocks = validBlocks.filter(block => !block.isBreak);
            const first = exerciseBlocks[0];
            const second = exerciseBlocks[1];
            const third = exerciseBlocks[2];

            const { error: updateError } = await supabase
                .from("trainings")
                .update({
                    title: title.trim(),
                    training_date: formatDateForDatabase(trainingDate),
                    start_time: startTime,
                    is_prepared: !asDraft,
                    team_id: Number(selectedTeamId),
                    warmup_exercise_id: publishedId(first?.exerciseId),
                    warmup_duration: Number(first?.duration || 0),
                    main_exercise_id: publishedId(second?.exerciseId),
                    main_duration: Number(second?.duration || 0),
                    match_exercise_id: publishedId(third?.exerciseId),
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
                    exercise_id: block.isBreak ? null : publishedId(block.exerciseId),
                    is_break: !!block.isBreak,
                    ...(conceptSchemaError ? {} : { concept_id: block.isBreak ? null : conceptId(block.exerciseId) }),
                    duration: Number(block.duration) || 0,
                    notes: block.notes.trim() || null,
                }))
            );

            if (insertBlocksError) throw insertBlocksError;

            Alert.alert("Gelukt", "Training bijgewerkt.");
            router.replace(`/training/${id}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Bijwerken mislukt.";
            setSaveError(message);
            if (Platform.OS !== "web") Alert.alert("Fout", message);
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
                {!!saveError && <Text style={{ color: "#FF8A8A", fontWeight: "700", marginBottom: 12 }}>{saveError}</Text>}

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

                <Text style={styles.label}>Begintijd van de training</Text>
                <TrainingStartTimePicker value={startTime} onChange={setStartTime} />
                <Text style={{color:COLORS.mutedText,fontSize:13,marginBottom:16}}>
                    De herinneringen worden berekend vanaf deze begintijd.
                </Text>

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
                    <Pressable style={[styles.filterButton, exerciseSource === "own" && styles.filterButtonSelected]} onPress={() => setExerciseSource("own")}>
                        <Text style={[styles.filterButtonText, exerciseSource === "own" && styles.filterButtonTextSelected]}>Eigen oefeningen</Text>
                    </Pressable>
                </View>

                {exerciseSource === "favorites" && favoriteExercises.length === 0 && (
                    <Text style={styles.warningText}>
                        Je hebt nog geen favorieten. Voeg eerst oefeningen toe aan je favorieten.
                    </Text>
                )}

                {exerciseSource === "own" && ownExercises.length === 0 && <Text style={styles.warningText}>Nog geen eigen oefeningen in afwachting van goedkeuring.</Text>}

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Trainingsonderdelen</Text>
                    <View style={styles.sectionActions}>
                        <Pressable style={[styles.smallButton, styles.sectionActionButton]} onPress={addBlock}>
                            <Text style={styles.smallButtonText}>Onderdeel toevoegen</Text>
                        </Pressable>
                        <Pressable style={[styles.smallButton, styles.sectionActionButton]} onPress={addBreak}>
                            <Text style={styles.smallButtonText}>+ Pauze</Text>
                        </Pressable>
                    </View>
                </View>

                {blocks.map((block, index) => (
                    <View key={block.localId} style={styles.blockCard}>
                        <View style={styles.blockTopRow}>
                            <Text style={styles.blockNumber}>{block.isBreak ? "Pauze" : "Onderdeel"} {index + 1}</Text>

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

                        {!block.isBreak && (() => {
                            const selectedExercise = getSelectedExercise(block.exerciseId);
                            return (
                                <Pressable style={styles.exercisePickerButton} onPress={() => openExerciseSelector(block.localId)}>
                                    {selectedExercise?.image_url ? (
                                        <ImageBackground source={{ uri: selectedExercise.image_url }} style={styles.exercisePickerThumb} imageStyle={styles.exercisePickerThumbImage} />
                                    ) : (
                                        <View style={styles.exercisePickerPlaceholder}>
                                            <Ionicons name="image-outline" size={24} color={COLORS.mutedText} />
                                        </View>
                                    )}
                                    <View style={styles.exercisePickerTextWrap}>
                                        <Text style={styles.exercisePickerLabel}>Oefening</Text>
                                        <Text style={styles.exercisePickerTitle} numberOfLines={2}>{selectedExercise?.title || "Kies een oefening"}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward-outline" size={22} color={COLORS.primaryLight} />
                                </Pressable>
                            );
                        })()}

                        <TextInput
                            style={styles.input}
                            placeholder={block.isBreak ? "Pauze in minuten" : "Duur in minuten"}
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

                <Modal visible={!!exerciseSelectorBlockId} transparent animationType="fade" onRequestClose={() => setExerciseSelectorBlockId(null)}>
                    <View style={styles.modalBackdrop}>
                        <View style={styles.exerciseModal}>
                            <View style={styles.modalHeader}>
                                <View style={styles.modalHeaderText}>
                                    <Text style={styles.modalTitle}>Kies een oefening</Text>
                                    <Text style={styles.modalSubtitle}>{selectedExerciseBlock?.title || "Trainingsonderdeel"}</Text>
                                </View>
                                <Pressable style={styles.modalCloseButton} onPress={() => setExerciseSelectorBlockId(null)}>
                                    <Ionicons name="close-outline" size={26} color={COLORS.text} />
                                </Pressable>
                            </View>
                            <ScrollView horizontal style={styles.categoryTabsScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryTabs}>
                                <Pressable style={[styles.categoryTab, exerciseCategoryFilter === "all" && styles.categoryTabSelected]} onPress={() => setExerciseCategoryFilter("all")}>
                                    <Text style={[styles.categoryTabText, exerciseCategoryFilter === "all" && styles.categoryTabTextSelected]}>Alle</Text>
                                </Pressable>
                                {categories.map((category) => {
                                    const selected = exerciseCategoryFilter === category.slug;
                                    return (
                                        <Pressable key={category.slug} style={[styles.categoryTab, selected && styles.categoryTabSelected]} onPress={() => setExerciseCategoryFilter(category.slug)}>
                                            <Text style={[styles.categoryTabText, selected && styles.categoryTabTextSelected]} numberOfLines={1}>{category.title}</Text>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                            <ScrollView style={styles.exerciseModalScroll} contentContainerStyle={styles.exerciseGrid}>
                                <Pressable style={styles.exerciseChoiceCard} accessibilityLabel="Maak oefening" onPress={() => {
                                    const blockId = exerciseSelectorBlockId;
                                    setExerciseSelectorBlockId(null);
                                    router.push({ pathname: "/eigen-oefening", params: { blockId: blockId || "" } } as never);
                                }}>
                                    <View style={[styles.exerciseChoiceImage, { alignItems:"center", justifyContent:"center", backgroundColor:COLORS.surfaceLight, borderWidth:1, borderStyle:"dashed", borderColor:COLORS.primaryLight }]}>
                                        <Ionicons name="add-circle-outline" size={46} color={COLORS.primaryLight} />
                                    </View>
                                    <Text style={styles.exerciseChoiceTitle}>Maak oefening</Text>
                                </Pressable>
                                {selectorExercises.length === 0 ? (
                                    <Text style={styles.modalEmptyText}>Geen oefeningen gevonden in deze categorie.</Text>
                                ) : selectorExercises.map((exercise) => {
                                    const selected = selectedExerciseBlock?.exerciseId === String(exercise.id);
                                    return (
                                        <Pressable key={exercise.id} style={[styles.exerciseChoiceCard, selected && styles.exerciseChoiceCardSelected]} onPress={() => selectExercise(exercise)}>
                                            {exercise.isConcept && !exercise.image_url ? (
                                                    <View style={[styles.exerciseChoiceImage, { backgroundColor: COLORS.surfaceLight, justifyContent:"center", alignItems:"center" }]}>
                                                        <Ionicons name="create-outline" size={32} color={COLORS.primaryLight}/>
                                                        {selected && <Ionicons name="checkmark-circle" size={19} color={COLORS.primaryLight}/>}
                                                    </View>
                                                ) : (<ImageBackground source={{ uri: exercise.image_url || "https://picsum.photos/600/400?random=99" }} style={styles.exerciseChoiceImage} imageStyle={styles.exerciseChoiceImageInner}>
                                                {selected && <View style={styles.selectedExerciseBadge}><Ionicons name="checkmark" size={16} color="#FFFFFF" /></View>}
                                            </ImageBackground>)}
                                            <Text style={styles.exerciseChoiceTitle} numberOfLines={2}>{exercise.title}</Text>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                {exerciseAddedMessage && <Text style={{ color: COLORS.primaryLight, fontWeight: "800", marginBottom: 12 }}>Je eigen oefening is toegevoegd aan dit onderdeel. Vergeet niet om ook de training hieronder op te slaan.</Text>}
                <Pressable style={styles.button} onPress={() => handleSave(false)} disabled={saving}>
                    {saving ? (
                        <ActivityIndicator color={COLORS.text} />
                    ) : (
                        <Text style={styles.buttonText}>Wijzigingen opslaan</Text>
                    )}
                </Pressable>
                <Pressable style={[styles.button, {backgroundColor:COLORS.surfaceLight,marginTop:12,borderWidth:1,borderColor:COLORS.border}]}
                    onPress={() => handleSave(true)} disabled={saving}>
                    <Text style={styles.buttonText}>Als concept plannen (herinneringen aan)</Text>
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
        gap: 12,
    },
    sectionActions: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "stretch",
        gap: 10,
        width: "100%",
    },
    sectionActionButton: {
        flexGrow: 1,
        flexBasis: 145,
        justifyContent: "center",
        minHeight: 44,
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
    exercisePickerButton: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 10, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
    exercisePickerThumb: { width: 74, height: 56, overflow: "hidden" },
    exercisePickerThumbImage: { borderRadius: 10 },
    exercisePickerPlaceholder: { width: 74, height: 56, borderRadius: 10, backgroundColor: COLORS.surfaceLight, alignItems: "center", justifyContent: "center" },
    exercisePickerTextWrap: { flex: 1, minWidth: 0 },
    exercisePickerLabel: { color: COLORS.primaryLight, fontSize: 12, fontWeight: "700", marginBottom: 3 },
    exercisePickerTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", lineHeight: 20 },
    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", alignItems: "center", justifyContent: "center", paddingHorizontal: 10, paddingVertical: 12 },
    exerciseModal: { width: "100%", maxWidth: 980, height: "92%", backgroundColor: COLORS.background, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12 },
    modalHeaderText: { flex: 1 },
    modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: "900", marginBottom: 2 },
    modalSubtitle: { color: COLORS.mutedText, fontSize: 14 },
    modalCloseButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
    categoryTabsScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 64, borderBottomWidth: 1, borderBottomColor: COLORS.border },
    categoryTabs: { paddingHorizontal: SPACING.md, paddingVertical: 10, gap: 8, alignItems: "center", flexGrow: 0 },
    categoryTab: { height: 42, flexGrow: 0, flexShrink: 0, alignSelf: "center", justifyContent: "center", paddingHorizontal: 15, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
    categoryTabSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    categoryTabText: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
    categoryTabTextSelected: { color: "#FFFFFF" },
    exerciseModalScroll: { flex: 1 },
    exerciseGrid: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 28, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
    exerciseChoiceCard: { width: "48.5%", backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden", minWidth: 0 },
    exerciseChoiceCardSelected: { borderColor: COLORS.primaryLight, borderWidth: 2 },
    exerciseChoiceImage: { width: "100%", aspectRatio: 1.45, alignItems: "flex-end", padding: 8 },
    exerciseChoiceImageInner: { borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg },
    selectedExerciseBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
    exerciseChoiceTitle: { color: COLORS.text, fontSize: 14, fontWeight: "800", lineHeight: 19, padding: 10 },
    modalEmptyText: { width: "100%", color: COLORS.mutedText, textAlign: "center", fontSize: 15, lineHeight: 22, paddingVertical: SPACING.xl },
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