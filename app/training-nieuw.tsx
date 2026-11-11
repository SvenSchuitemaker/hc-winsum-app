import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, {
    DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ImageBackground,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import ExercisePicker, { type ExerciseCategory, type ExerciseChoice } from "../components/ExercisePicker";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { planPhaseOn, type TeamTrainingPlan } from "../lib/teamTrainingPlans";
import { takeCreatedTrainerExercise } from "../lib/trainerExerciseSelection";
import { getTrainerExercisePreviewUrl } from "../lib/trainerExercisePreview";

type ExerciseOption = ExerciseChoice;

type TeamOption = {
    id: number;
    name: string;
};

type TemplateOption = {
    id: number;
    title: string;
    team_id: number | null;
};

type BlockDraft = {
    isBreak?: boolean;
    localId: string;
    title: string;
    exerciseId: string;
    duration: string;
    notes: string;
};

type TemplateBlockRow = {
    position: number;
    title: string;
    exercise_id: number | null;
    concept_id?: string | null;
    duration: number;
    notes: string | null;
};

type TrainingSourceRow = {
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
    is_break?: boolean;
    position: number;
    title: string;
    exercise_id: number | null;
    concept_id?: string | null;
    duration: number;
    notes: string | null;
};

function makeLocalId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultBlocks(firstExerciseId = ""): BlockDraft[] {
    return [
        {
            localId: makeLocalId(),
            title: "Warm-up",
            exerciseId: firstExerciseId,
            duration: "10",
            notes: "",
        },
        {
            localId: makeLocalId(),
            title: "Oefening",
            exerciseId: firstExerciseId,
            duration: "20",
            notes: "",
        },
        {
            localId: makeLocalId(),
            title: "Eindpartij",
            exerciseId: firstExerciseId,
            duration: "20",
            notes: "",
        },
    ];
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

function parseWebDate(value: string) {
    if (!value) return null;

    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day);
}

function WebDatePicker({
    value,
    onChange,
}: {
    value: Date | null;
    onChange: (date: Date | null) => void;
}) {
    return (
        <View style={styles.webDateWrap}>
            {createElement("input" as any, {
                type: "date",
                value: formatDateForDatabase(value) ?? "",
                onChange: (event: any) => onChange(parseWebDate(event.target.value)),
                "aria-label": "Kies een datum",
                style: {
                    width: "100%",
                    minHeight: 48,
                    border: "none",
                    outline: "none",
                    backgroundColor: "transparent",
                    color: COLORS.text,
                    fontSize: 16,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    padding: 0,
                    margin: 0,
                    cursor: "pointer",
                    colorScheme: "dark",
                },
            })}
        </View>
    );
}

export default function TrainingNieuwScreen() {
    const { user } = useAuth();
    const params = useLocalSearchParams<{
        templateId?: string;
        duplicateTrainingId?: string;
    }>();

    const [title, setTitle] = useState("");
    const [trainingDate, setTrainingDate] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [teams, setTeams] = useState<TeamOption[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<string>("");

    const [templates, setTemplates] = useState<TemplateOption[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

    const [categories, setCategories] = useState<ExerciseCategory[]>([]);
    const [allExercises, setAllExercises] = useState<ExerciseOption[]>([]);
    const [favoriteExercises, setFavoriteExercises] = useState<ExerciseOption[]>([]);
    const [ownExercises, setOwnExercises] = useState<ExerciseOption[]>([]);
    const [exerciseAddedMessage, setExerciseAddedMessage] = useState(false);
    const [exerciseSource, setExerciseSource] = useState<"all" | "favorites" | "own">("all");
    const [exerciseSelectorBlockId, setExerciseSelectorBlockId] = useState<string | null>(null);

    const [blocks, setBlocks] = useState<BlockDraft[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [templateLoading, setTemplateLoading] = useState(false);
    const [planResult, setPlanResult] = useState<{
        teamId: string;
        date: string;
        plans: TeamTrainingPlan[];
        exercises: ExerciseOption[];
        failed: boolean;
    } | null>(null);

    const selectedDate = formatDateForDatabase(trainingDate);
    const currentPlanResult = planResult?.teamId === selectedTeamId && planResult.date === selectedDate ? planResult : null;
    const activePhases = (currentPlanResult?.plans ?? []).flatMap(plan => {
        const phase = selectedDate && planPhaseOn(plan, selectedDate);
        return phase ? [{ planId: plan.id, phase }] : [];
    });

    useFocusEffect(useCallback(() => {
        if (!supabase || !user || !selectedTeamId || !selectedDate) return;
        let active = true;
        async function loadPlans() {
            if (!supabase || !selectedDate) return;
            const result = await supabase.from("team_training_plans")
                .select("id, starts_on, ends_before, months, phases")
                .eq("team_id", Number(selectedTeamId))
                .lte("starts_on", selectedDate).gt("ends_before", selectedDate)
                .order("starts_on", { ascending: false }).order("id");
            if (!active) return;
            const plans = (result.data ?? []) as TeamTrainingPlan[];
            const exerciseIds = [...new Set(plans.flatMap(plan => planPhaseOn(plan, selectedDate)?.exerciseIds ?? []))];
            const plannedExercises: ExerciseOption[] = [];
            let failed = !!result.error;
            for (let offset = 0; active && offset < exerciseIds.length; offset += 100) {
                const page = await supabase.from("exercises").select("id, title, category_slug, image_url")
                    .in("id", exerciseIds.slice(offset, offset + 100));
                if (page.error) {
                    failed = true;
                    break;
                }
                plannedExercises.push(...page.data);
            }
            if (active) setPlanResult({
                teamId: selectedTeamId,
                date: selectedDate,
                plans,
                exercises: plannedExercises,
                failed,
            });
        }
        void loadPlans();
        return () => { active = false; };
    }, [user, selectedTeamId, selectedDate]));

    const exercises = useMemo(() => {
        return exerciseSource === "favorites" ? favoriteExercises : exerciseSource === "own" ? ownExercises : allExercises;
    }, [exerciseSource, favoriteExercises, ownExercises, allExercises]);

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
        loadData();
    }, [user]);

    async function loadData() {
        try {
            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const [
                { data: teamsData, error: teamsError },
                { data: categoryData, error: categoryError },
                { data: exerciseData, error: exerciseError },
                { data: templateData, error: templateError },
            ] = await Promise.all([
                supabase.from("teams").select("id, name").order("name", { ascending: true }),
                supabase.from("categories").select("slug, title").order("id", { ascending: true }),
                supabase
                    .from("exercises")
                    .select("id, title, category_slug, image_url")
                    .order("title", { ascending: true }),
                supabase
                    .from("training_templates")
                    .select("id, title, team_id")
                    .order("created_at", { ascending: false }),
            ]);

            if (teamsError) throw teamsError;
            if (categoryError) throw categoryError;
            if (exerciseError) throw exerciseError;
            if (templateError) throw templateError;

            const loadedTeams = (teamsData as TeamOption[]) || [];
            const loadedCategories = (categoryData as ExerciseCategory[]) || [];
            const loadedExercises = (exerciseData as ExerciseOption[]) || [];
            const loadedTemplates = (templateData as TemplateOption[]) || [];

            setTeams(loadedTeams);
            setCategories(loadedCategories);
            setTemplates(loadedTemplates);
            setAllExercises(loadedExercises);

            const firstExerciseId = loadedExercises[0] ? String(loadedExercises[0].id) : "";
            setBlocks(defaultBlocks(firstExerciseId));

            if (loadedTeams.length > 0) {
                setSelectedTeamId(String(loadedTeams[0].id));
            }

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

            if (params.templateId) {
                await applyTemplate(String(params.templateId), loadedExercises);
            } else if (params.duplicateTrainingId) {
                await duplicateFromTraining(String(params.duplicateTrainingId), loadedExercises);
            }
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Data laden mislukt."
            );
        } finally {
            setLoadingData(false);
        }
    }

    async function applyTemplate(templateId: string, loadedExercises = allExercises) {
        try {
            setTemplateLoading(true);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const [{ data: templateData, error: templateError }, { data: blockData, error: blockError }] =
                await Promise.all([
                    supabase
                        .from("training_templates")
                        .select("id, title, team_id")
                        .eq("id", Number(templateId))
                        .single(),
                    supabase
                        .from("training_template_blocks")
                        .select("position, title, exercise_id, duration, notes")
                        .eq("template_id", Number(templateId))
                        .order("position", { ascending: true }),
                ]);

            if (templateError) throw templateError;
            if (blockError) throw blockError;

            const template = templateData as TemplateOption;
            const rows = (blockData as TemplateBlockRow[]) || [];

            setSelectedTemplateId(templateId);
            setTitle(template.title);
            if (template.team_id) {
                setSelectedTeamId(String(template.team_id));
            }

            const fallbackExerciseId = loadedExercises[0] ? String(loadedExercises[0].id) : "";

            setBlocks(
                rows.length > 0
                    ? rows.map((row) => ({
                        localId: makeLocalId(),
                        title: row.title,
                        isBreak: !!row.is_break,
                        exerciseId: row.is_break ? "" : row.concept_id ? `concept:${row.concept_id}` : row.exercise_id ? String(row.exercise_id) : fallbackExerciseId,
                        duration: String(row.duration ?? 0),
                        notes: row.notes || "",
                    }))
                    : defaultBlocks(fallbackExerciseId)
            );
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Template laden mislukt."
            );
        } finally {
            setTemplateLoading(false);
        }
    }

    async function duplicateFromTraining(trainingId: string, loadedExercises = allExercises) {
        try {
            setTemplateLoading(true);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const [{ data: trainingData, error: trainingError }, { data: blockData, error: blockError }] =
                await Promise.all([
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
                        .eq("id", Number(trainingId))
                        .single(),
                    supabase
                        .from("training_blocks")
                        .select("position, title, exercise_id, concept_id, is_break, duration, notes")
                        .eq("training_id", Number(trainingId))
                        .order("position", { ascending: true }),
                ]);

            if (trainingError) throw trainingError;
            if (blockError) throw blockError;

            const training = trainingData as TrainingSourceRow;
            const rows = (blockData as TrainingBlockRow[]) || [];
            const fallbackExerciseId = loadedExercises[0] ? String(loadedExercises[0].id) : "";

            setTitle(`${training.title} (kopie)`);
            setTrainingDate(null);
            if (training.team_id) {
                setSelectedTeamId(String(training.team_id));
            }

            if (rows.length > 0) {
                setBlocks(
                    rows.map((row) => ({
                        localId: makeLocalId(),
                        title: row.title,
                        exerciseId: row.concept_id ? `concept:${row.concept_id}` : row.exercise_id ? String(row.exercise_id) : fallbackExerciseId,
                        duration: String(row.duration ?? 0),
                        notes: row.notes || "",
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
                error instanceof Error ? error.message : "Training dupliceren mislukt."
            );
        } finally {
            setTemplateLoading(false);
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
    }

    function selectExercise(exercise: ExerciseOption) {
        if (!exerciseSelectorBlockId) return;

        updateBlock(exerciseSelectorBlockId, "exerciseId", String(exercise.id));
        setExerciseSelectorBlockId(null);
    }

    function getSelectedExercise(exerciseId: string) {
        return [...allExercises, ...ownExercises].find((exercise) => String(exercise.id) === exerciseId) ?? null;
    }

    function addPlannedExercise(exercise: ExerciseOption) {
        setAllExercises(current => current.some(item => item.id === exercise.id) ? current : [...current, exercise]);
        setBlocks(current => current.some(block => !block.isBreak && block.exerciseId === String(exercise.id)) ? current : [...current, {
            localId: makeLocalId(),
            title: exercise.title,
            exerciseId: String(exercise.id),
            duration: "10",
            notes: "",
        }]);
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
        if (!user) {
            Alert.alert("Inloggen vereist", "Log eerst in om een training op te slaan.");
            return;
        }

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

        if (!trainingDate) {
            Alert.alert("Datum ontbreekt", "Kies eerst een trainingsdatum.");
            return;
        }
        try {
            setSaving(true);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const { error: conceptSchemaError } = await supabase.from("training_blocks").select("concept_id").limit(0);
            if (conceptSchemaError && validBlocks.some(block => conceptId(block.exerciseId))) {
                throw new Error("Eigen oefeningen kunnen nog niet aan trainingen worden gekoppeld: de Supabase-migratie voor concept_id ontbreekt. Je training is niet opgeslagen.");
            }

            const exerciseBlocks = validBlocks.filter(block => !block.isBreak);
            const first = exerciseBlocks[0];
            const second = exerciseBlocks[1];
            const third = exerciseBlocks[2];

            const { data, error } = await supabase
                .from("trainings")
                .insert({
                    user_id: user.id,
                    team_id: Number(selectedTeamId),
                    title: title.trim(),
                    training_date: formatDateForDatabase(trainingDate),
                    is_prepared: !asDraft,
                    warmup_exercise_id: publishedId(first?.exerciseId),
                    warmup_duration: Number(first?.duration || 0),
                    main_exercise_id: publishedId(second?.exerciseId),
                    main_duration: Number(second?.duration || 0),
                    match_exercise_id: publishedId(third?.exerciseId),
                    match_duration: Number(third?.duration || 0),
                })
                .select("id")
                .single();

            if (error) throw error;
            if (!data?.id) throw new Error("Training opgeslagen, maar id ontbreekt.");

            const { error: blocksError } = await supabase.from("training_blocks").insert(
                validBlocks.map((block, index) => ({
                    training_id: data.id,
                    position: index + 1,
                    title: block.title.trim(),
                    exercise_id: block.isBreak ? null : publishedId(block.exerciseId),
                    is_break: !!block.isBreak,
                    ...(conceptSchemaError ? {} : { concept_id: block.isBreak ? null : conceptId(block.exerciseId) }),
                    duration: Number(block.duration) || 0,
                    notes: block.notes.trim() || null,
                }))
            );

            if (blocksError) {
                // Prevent an unusable training from remaining in the planning.
                const { error: rollbackError } = await supabase.from("trainings").delete().eq("id", data.id);
                if (rollbackError) {
                    throw new Error(`Onderdelen opslaan mislukt (${blocksError.message}). Training #${data.id} bestaat nog zonder onderdelen; verwijderen mislukte ook (${rollbackError.message}).`);
                }
                throw new Error(`Training niet opgeslagen: ${blocksError.message}`);
            }

            Alert.alert("Gelukt", "Training opgeslagen.");
            router.replace(`/training/${data.id}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Opslaan mislukt.";
            setSaveError(message);
            if (Platform.OS !== "web") Alert.alert("Fout", message);
        } finally {
            setSaving(false);
        }
    }

    if (loadingData || templateLoading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                <Text style={styles.title}>Nieuwe training</Text>
                {!!saveError && <Text style={{ color: "#FF8A8A", fontWeight: "700", marginBottom: 12 }}>{saveError}</Text>}
                <Text style={styles.text}>
                    Stel een training samen met meerdere onderdelen en koppel hem aan een team.
                </Text>

                <Text style={styles.label}>Naam training</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Bijv. Training JO12 woensdag"
                    placeholderTextColor={COLORS.mutedText}
                    value={title}
                    onChangeText={setTitle}
                />

                <Text style={styles.label}>Start vanuit template</Text>
                <View style={styles.pickerWrap}>
                    <Picker
                        selectedValue={selectedTemplateId}
                        onValueChange={(value) => setSelectedTemplateId(String(value))}
                        dropdownIconColor="#111111"
                        style={styles.picker}
                    >
                        <Picker.Item label="Geen template" value="" color="#111111" />
                        {templates.map((template) => (
                            <Picker.Item
                                key={template.id}
                                label={template.title}
                                value={String(template.id)}
                                color="#111111"
                            />
                        ))}
                    </Picker>
                </View>

                {!!selectedTemplateId && (
                    <Pressable
                        style={styles.secondaryButton}
                        onPress={() => applyTemplate(selectedTemplateId)}
                    >
                        <Text style={styles.secondaryButtonText}>Template laden</Text>
                    </Pressable>
                )}

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
                {Platform.OS === "web" ? (
                    <WebDatePicker value={trainingDate} onChange={setTrainingDate} />
                ) : (
                    <>
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
                    </>
                )}

                <Text style={{color:COLORS.mutedText,fontSize:13,marginBottom:16}}>
                    De hoofdtrainer beheert de vaste trainingstijden per team. Herinneringen volgen automatisch dat rooster.
                </Text>

                {!!selectedTeamId && (
                    <View style={styles.teamPlan}>
                        <Pressable accessibilityRole="link" onPress={() => router.push({
                            pathname: "/team-trainingsplan/[teamId]",
                            params: { teamId: selectedTeamId },
                        })}>
                            <Text style={styles.teamPlanLink}>Trainingsplannen van dit team bekijken</Text>
                        </Pressable>
                        {currentPlanResult?.failed && (
                            <Text style={styles.teamPlanText}>Trainingsplan voor deze datum kon niet worden geladen.</Text>
                        )}
                        {activePhases.map(({ planId, phase }) => (
                            <View key={planId} style={styles.teamPlan}>
                                <Text style={styles.label}>{phase.goal}</Text>
                                {phase.exerciseIds.map(id => {
                                    const exercise = currentPlanResult?.exercises.find(item => item.id === id);
                                    if (!exercise) return <Text key={id} style={styles.teamPlanText}>Oefening niet beschikbaar</Text>;
                                    const alreadyAdded = blocks.some(block => !block.isBreak && block.exerciseId === String(id));
                                    return (
                                        <Pressable key={id} accessibilityRole="button" disabled={alreadyAdded}
                                            onPress={() => addPlannedExercise(exercise)}>
                                            <Text style={alreadyAdded ? styles.teamPlanText : styles.teamPlanLink}>
                                                {alreadyAdded ? "In training · " : "+ "}{exercise.title}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        ))}
                    </View>
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
                                <Pressable
                                    style={styles.exercisePickerButton}
                                    onPress={() => openExerciseSelector(block.localId)}
                                >
                                    {selectedExercise?.image_url ? (
                                        <ImageBackground
                                            source={{ uri: selectedExercise.image_url }}
                                            style={styles.exercisePickerThumb}
                                            imageStyle={styles.exercisePickerThumbImage}
                                        />
                                    ) : (
                                        <View style={styles.exercisePickerPlaceholder}>
                                            <Ionicons name="image-outline" size={24} color={COLORS.mutedText} />
                                        </View>
                                    )}

                                    <View style={styles.exercisePickerTextWrap}>
                                        <Text style={styles.exercisePickerLabel}>Oefening</Text>
                                        <Text style={styles.exercisePickerTitle} numberOfLines={2}>
                                            {selectedExercise?.title || "Kies een oefening"}
                                        </Text>
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

                {exerciseSelectorBlockId && (
                    <ExercisePicker subtitle={selectedExerciseBlock?.title || "Trainingsonderdeel"}
                        exercises={exercises} categories={categories} selectedId={selectedExerciseBlock?.exerciseId}
                        onSelect={selectExercise} onClose={() => setExerciseSelectorBlockId(null)}
                        onCreate={() => {
                            setExerciseSelectorBlockId(null);
                            router.push({ pathname: "/eigen-oefening", params: { blockId: exerciseSelectorBlockId } } as never);
                        }} />
                )}

                {exerciseAddedMessage && <Text style={{ color: COLORS.primaryLight, fontWeight: "800", marginBottom: 12 }}>Je eigen oefening is toegevoegd aan dit onderdeel. Vergeet niet om ook de training hieronder op te slaan.</Text>}
                <Pressable style={styles.button} onPress={() => handleSave(false)} disabled={saving}>
                    {saving ? (
                        <ActivityIndicator color={COLORS.text} />
                    ) : (
                        <Text style={styles.buttonText}>Training opslaan</Text>
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
    teamPlan: { gap: SPACING.sm, marginBottom: SPACING.md },
    teamPlanLink: { color: COLORS.accent, fontWeight: "700", minHeight: 32 },
    teamPlanText: { color: COLORS.mutedText },
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
    text: {
        color: COLORS.mutedText,
        fontSize: 16,
        lineHeight: 24,
        marginBottom: SPACING.md,
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
    webDateWrap: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.md,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
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
    exercisePickerButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.md,
        padding: 10,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    exercisePickerThumb: {
        width: 74,
        height: 56,
        overflow: "hidden",
    },
    exercisePickerThumbImage: {
        borderRadius: 10,
    },
    exercisePickerPlaceholder: {
        width: 74,
        height: 56,
        borderRadius: 10,
        backgroundColor: COLORS.surfaceLight,
        alignItems: "center",
        justifyContent: "center",
    },
    exercisePickerTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    exercisePickerLabel: {
        color: COLORS.primaryLight,
        fontSize: 12,
        fontWeight: "700",
        marginBottom: 3,
    },
    exercisePickerTitle: {
        color: COLORS.text,
        fontSize: 15,
        fontWeight: "800",
        lineHeight: 20,
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
    secondaryButton: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        alignItems: "center",
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
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
    secondaryButtonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 15,
    },
    smallButtonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 13,
    },
});
