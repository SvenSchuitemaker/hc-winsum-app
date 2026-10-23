import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { supabase } from "../../lib/supabase";
import { getTrainerExercisePreviewUrl } from "../../lib/trainerExercisePreview";
import { useAuth } from "../../context/AuthContext";

type ExerciseRef = {
    id: number;
    title: string;
    image_url: string | null;
};

type TeamRef = {
    id: number;
    name: string;
};

type TrainingBlock = {
    id?: number;
    is_break?: boolean;
    position: number;
    title: string;
    duration: number;
    notes: string | null;
    exercises: ExerciseRef | null;
    concept: { id: string; title: string; preview_image_path?: string | null; image_url?: string | null } | null;
};

type TrainingNote = {
    training_id: number;
    author_user_id: string;
    what_went_well: string | null;
    what_to_improve: string | null;
    next_time_notes: string | null;
    attendance_note: string | null;
};

type TrainingDetail = {
    id: number;
    title: string;
    training_date: string | null;
    warmup_duration: number;
    main_duration: number;
    match_duration: number;
    team_id: number | null;
    share_token: string;
    teams: TeamRef | null;
};

type SupabaseTrainingDetail = {
    id: number;
    title: string;
    training_date: string | null;
    warmup_duration: number;
    main_duration: number;
    match_duration: number;
    team_id: number | null;
    share_token: string;
    teams: TeamRef[] | TeamRef | null;
};

function formatDateForDisplay(dateString: string | null) {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-");
    if (!year || !month || !day) return dateString;
    return `${day}-${month}-${year}`;
}

export default function TrainingDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user, role } = useAuth();
    const [feedback, setFeedback] = useState<{id:string;message:string;created_at:string;author_user_id:string}[]>([]);
    const [feedbackText, setFeedbackText] = useState("");
    const [savingFeedback, setSavingFeedback] = useState(false);

    const [training, setTraining] = useState<TrainingDetail | null>(null);
    const [blocks, setBlocks] = useState<TrainingBlock[]>([]);
    const [note, setNote] = useState<TrainingNote | null>(null);

    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [savingNote, setSavingNote] = useState(false);

    const [errorText, setErrorText] = useState("");
    const [whatWentWell, setWhatWentWell] = useState("");
    const [whatToImprove, setWhatToImprove] = useState("");
    const [nextTimeNotes, setNextTimeNotes] = useState("");
    const [attendanceNote, setAttendanceNote] = useState("");

    useEffect(() => {
        if (id) {
            loadTraining();
        }
    }, [id]);

    function normalizeRelation<T>(value: T[] | T | null): T | null {
        if (!value) return null;
        if (Array.isArray(value)) {
            return value.length > 0 ? value[0] : null;
        }
        return value;
    }

    async function loadTraining() {
        try {
            if (!supabase) {
                setErrorText("Supabase is niet geladen.");
                return;
            }

            const [
                { data: trainingData, error: trainingError },
                { data: initialBlockData, error: initialBlockError },
                { data: noteData, error: noteError },
            ] = await Promise.all([
                supabase
                    .from("trainings")
                    .select(`
            id,
            title,
            training_date,
            warmup_duration,
            main_duration,
            match_duration,
            team_id,
            share_token,
            teams ( id, name )
          `)
                    .eq("id", Number(id))
                    .single(),
                supabase
                    .from("training_blocks")
                    .select(`
            id,
            position,
            title,
            is_break,
            duration,
            notes,
            exercises:exercises ( id, title, image_url ),
            concept:exercise_concepts ( id, title, preview_image_path )
          `)
                    .eq("training_id", Number(id))
                    .order("position", { ascending: true }),
                supabase
                    .from("training_notes")
                    .select(`
            training_id,
            author_user_id,
            what_went_well,
            what_to_improve,
            next_time_notes,
            attendance_note
          `)
                    .eq("training_id", Number(id))
                    .maybeSingle(),
            ]);

            let blockData: any = initialBlockData;
            let blockError: any = initialBlockError;
            if (blockError) {
                const withoutPreview = await supabase.from("training_blocks")
                    .select("id, position, title, duration, notes, exercises:exercises ( id, title, image_url ), concept:exercise_concepts ( id, title )")
                    .eq("training_id", Number(id)).order("position", { ascending: true });
                if (!withoutPreview.error) { blockData = withoutPreview.data; blockError = null; }
            }
            if (blockError) {
                // Older databases may not yet have the trainer-concept relationship.
                const legacy = await supabase.from("training_blocks")
                    .select("id, position, title, duration, notes, exercises:exercises ( id, title, image_url )")
                    .eq("training_id", Number(id)).order("position", { ascending: true });
                if (!legacy.error) { blockData = legacy.data; blockError = null; }
            }

            if (trainingError) throw trainingError;
            if (blockError) throw blockError;
            if (noteError) throw noteError;

            const item = trainingData as SupabaseTrainingDetail;

            setTraining({
                id: item.id,
                title: item.title,
                training_date: item.training_date,
                warmup_duration: item.warmup_duration,
                main_duration: item.main_duration,
                match_duration: item.match_duration,
                team_id: item.team_id,
                share_token: item.share_token,
                teams: normalizeRelation(item.teams),
            });

            const loadedBlocks = await Promise.all(((blockData as any[]) || []).map(async (block) => {
                const concept: any = normalizeRelation(block.concept);
                return {
                    id: block.id, position: block.position, title: block.title, is_break: !!block.is_break,
                    duration: block.duration, notes: block.notes,
                    exercises: normalizeRelation(block.exercises),
                    concept: concept ? {
                        ...concept,
                        image_url: await getTrainerExercisePreviewUrl(concept.preview_image_path),
                    } : null,
                } as TrainingBlock;
            }));
            setBlocks(loadedBlocks);
            const { data: feedbackData, error: feedbackError } = await supabase.from("training_feedback")
                .select("id, message, created_at, author_user_id")
                .eq("training_id", Number(id)).order("created_at", {ascending: false});
            if (feedbackError) throw feedbackError;
            setFeedback(feedbackData || []);

            const loadedNote = (noteData as TrainingNote | null) ?? null;
            setNote(loadedNote);
            setWhatWentWell(loadedNote?.what_went_well || "");
            setWhatToImprove(loadedNote?.what_to_improve || "");
            setNextTimeNotes(loadedNote?.next_time_notes || "");
            setAttendanceNote(loadedNote?.attendance_note || "");
        } catch (error) {
            setErrorText(
                error instanceof Error ? error.message : "Training laden mislukt."
            );
        } finally {
            setLoading(false);
        }
    }

    function confirmDelete() {
        Alert.alert(
            "Training verwijderen",
            "Weet je zeker dat je deze training wilt verwijderen?",
            [
                { text: "Annuleren", style: "cancel" },
                { text: "Verwijderen", style: "destructive", onPress: handleDelete },
            ]
        );
    }

    async function handleDelete() {
        try {
            setDeleting(true);

            if (!supabase || !training) {
                throw new Error("Training niet geladen.");
            }

            const { error } = await supabase
                .from("trainings")
                .delete()
                .eq("id", training.id);

            if (error) throw error;

            Alert.alert("Verwijderd", "De training is verwijderd.");
            router.replace("/training-maken");
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Verwijderen mislukt."
            );
        } finally {
            setDeleting(false);
        }
    }

    async function handleShare() {
        if (!training) return;

        const publicUrl = `https://svenschuitemaker.github.io/hc-winsum-app/shared-training/${training.share_token}`;
        const shareText = [
            `Training: ${training.title}`,
            training.teams?.name ? `Team: ${training.teams.name}` : null,
            training.training_date
                ? `Datum: ${formatDateForDisplay(training.training_date)}`
                : null,
            "",
            "Bekijk de volledige training met oefeningafbeeldingen:",
            publicUrl,
        ]
            .filter(Boolean)
            .join("\n");

        try {
            await Share.share({
                title: training.title,
                message: shareText,
            });
        } catch (error) {
            Alert.alert("Fout", error instanceof Error ? error.message : "Delen mislukt.");
        }
    }

    async function handleSaveAsTemplate() {
        if (!training) return;

        try {
            setSavingTemplate(true);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const { data: templateData, error: templateError } = await supabase
                .from("training_templates")
                .insert({
                    user_id: (await supabase.auth.getUser()).data.user?.id,
                    team_id: training.team_id,
                    title: `${training.title} template`,
                })
                .select("id")
                .single();

            if (templateError) throw templateError;
            if (!templateData?.id) throw new Error("Template opgeslagen zonder id.");

            const { error: blockError } = await supabase
                .from("training_template_blocks")
                .insert(
                    blocks.map((block, index) => ({
                        template_id: templateData.id,
                        position: index + 1,
                        title: block.title,
                        exercise_id: block.exercises?.id ?? null,
                        duration: block.duration,
                        notes: block.notes,
                    }))
                );

            if (blockError) throw blockError;

            Alert.alert("Gelukt", "Training opgeslagen als template.");
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Template opslaan mislukt."
            );
        } finally {
            setSavingTemplate(false);
        }
    }

    function handleDuplicate() {
        router.push(`/training-nieuw?duplicateTrainingId=${id}`);
    }

    async function handleSaveNote() {
        try {
            setSavingNote(true);

            if (!supabase || !training) {
                throw new Error("Training niet geladen.");
            }

            const currentUser = (await supabase.auth.getUser()).data.user;
            if (!currentUser) {
                throw new Error("Je bent niet ingelogd.");
            }

            const payload = {
                training_id: training.id,
                author_user_id: currentUser.id,
                what_went_well: whatWentWell.trim() || null,
                what_to_improve: whatToImprove.trim() || null,
                next_time_notes: nextTimeNotes.trim() || null,
                attendance_note: attendanceNote.trim() || null,
            };

            const { error } = await supabase
                .from("training_notes")
                .upsert(payload, { onConflict: "training_id" });

            if (error) throw error;

            Alert.alert("Gelukt", "Evaluatie opgeslagen.");
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Evaluatie opslaan mislukt."
            );
        } finally {
            setSavingNote(false);
        }
    }

    async function sendFeedback() {
        if (!supabase || !user || !training || !feedbackText.trim()) return;
        setSavingFeedback(true);
        try {
            const { data, error } = await supabase.from("training_feedback")
                .insert({ training_id: training.id, author_user_id: user.id, message: feedbackText.trim() })
                .select("id, message, created_at, author_user_id").single();
            if (error) throw error;
            setFeedback(current => [data, ...current]);
            setFeedbackText("");
        } catch (reason) {
            Alert.alert("Feedback niet opgeslagen", reason instanceof Error ? reason.message : "Probeer opnieuw.");
        } finally { setSavingFeedback(false); }
    }

    const totalTime = useMemo(
        () => blocks.reduce((sum, block) => sum + (block.duration || 0), 0),
        [blocks]
    );

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (errorText || !training) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Training niet gevonden</Text>
                <Text style={styles.text}>{errorText || "Er ging iets mis."}</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                <View style={styles.headerContent}>
                    <Text style={styles.title}>{training.title}</Text>

                    {!!training.training_date && (
                        <Text style={styles.trainingDate}>
                            Datum: {formatDateForDisplay(training.training_date)}
                        </Text>
                    )}

                    <Text style={styles.trainingTeam}>
                        Team: {training.teams?.name || "Geen team"}
                    </Text>

                    <Text style={styles.totalTime}>Totale tijd: {totalTime} minuten</Text>
                </View>

                <Pressable style={styles.saveNoteButton} onPress={() => router.push(`/training-live/${training.id}`)}>
                    <Text style={styles.saveNoteButtonText}>▶ Start trainingsmodus</Text>
                </Pressable>
                <View style={{height: 14}} />
                <View style={styles.actionRow}>
                    <Pressable
                        style={styles.iconActionButton}
                        onPress={() => router.push(`/training-bewerk/${training.id}`)}
                    >
                        <Ionicons name="brush-outline" size={20} color={COLORS.text} />
                    </Pressable>

                    <Pressable style={styles.iconActionButton} onPress={handleShare}>
                        <Ionicons name="share-social-outline" size={20} color={COLORS.text} />
                    </Pressable>

                    <Pressable style={styles.iconActionButton} onPress={handleDuplicate}>
                        <Ionicons name="copy-outline" size={20} color={COLORS.text} />
                    </Pressable>

                    <Pressable
                        style={[
                            styles.iconActionButton,
                            savingTemplate && styles.iconActionButtonDisabled,
                        ]}
                        onPress={handleSaveAsTemplate}
                        disabled={savingTemplate}
                    >
                        {savingTemplate ? (
                            <ActivityIndicator size="small" color={COLORS.text} />
                        ) : (
                            <Ionicons name="bookmark-outline" size={20} color={COLORS.text} />
                        )}
                    </Pressable>

                    <Pressable
                        style={[
                            styles.deleteIconButton,
                            deleting && styles.deleteIconButtonDisabled,
                        ]}
                        onPress={confirmDelete}
                        disabled={deleting}
                    >
                        {deleting ? (
                            <ActivityIndicator size="small" color="#C0392B" />
                        ) : (
                            <Ionicons name="trash-outline" size={20} color="#C0392B" />
                        )}
                    </Pressable>
                </View>

                {blocks.length === 0 && <Text style={{ color: "#FF8A8A", marginVertical: 12 }}>Deze training heeft geen opgeslagen onderdelen. Maak de training opnieuw of verwijder dit incomplete item.</Text>}
                {blocks.map((block, index) => (
                    <Pressable
                        key={`${block.position}-${block.title}`}
                        style={styles.block}
                        onPress={() => {
                            if (block.exercises?.id) {
                                router.push(`/exercise/${block.exercises.id}`);
                            } else if (block.concept?.id) {
                                router.push({ pathname: "/eigen-oefening", params: { id: block.concept.id } } as never);
                            }
                        }}
                        disabled={!!block.is_break || (!block.exercises?.id && !block.concept?.id)}
                    >
                        <View style={styles.blockHeader}>
                            <View style={styles.numberBadge}>
                                <Text style={styles.numberBadgeText}>{index + 1}</Text>
                            </View>
                            <Text style={styles.blockTitle}>{block.title}</Text>
                        </View>

                        <Text style={styles.blockText}>{block.is_break ? "⏸ Tijd om het veld klaar te zetten" : block.exercises?.title || block.concept?.title || "Privéconcept (niet openbaar)"}</Text>
                        {!!(block.concept?.image_url || block.exercises?.image_url) && <Image source={{ uri: block.concept?.image_url || block.exercises?.image_url || "" }} style={{ width: "100%", height: 170, marginVertical: 10, borderRadius: 12 }} resizeMode="contain" />}
                        <Text style={styles.blockTime}>{block.duration} minuten</Text>
                        {!!block.notes && <Text style={styles.blockNotes}>{block.notes}</Text>}
                        {(!!block.exercises || !!block.concept) && <Text style={styles.linkText}>Open oefening</Text>}
                    </Pressable>
                ))}
            </View>

            <View style={styles.card}>
                <Text style={styles.notesTitle}>Feedback van hoofdtrainers</Text>
                {feedback.length === 0 && <Text style={styles.blockNotes}>Er is nog geen feedback gegeven.</Text>}
                {feedback.map(item => <View key={item.id} style={styles.block}>
                    <Text style={styles.blockTitle}>Hoofdtrainer · {new Date(item.created_at).toLocaleDateString("nl-NL")}</Text>
                    <Text style={styles.blockNotes}>{item.message}</Text>
                </View>)}
                {(role === "head_trainer" || role === "super_admin") && <>
                    <TextInput style={[styles.input, styles.textarea]} multiline value={feedbackText}
                        onChangeText={setFeedbackText} placeholder="Geef de trainer een tip of compliment..."
                        placeholderTextColor={COLORS.mutedText} maxLength={2000} />
                    <Pressable disabled={savingFeedback || !feedbackText.trim()} style={styles.saveNoteButton}
                        onPress={() => void sendFeedback()}>
                        <Text style={styles.saveNoteButtonText}>{savingFeedback ? "Opslaan..." : "Feedback plaatsen"}</Text>
                    </Pressable>
                </>}
            </View>
            <View style={styles.card}>
                <Text style={styles.notesTitle}>Evaluatie na training</Text>

                <Text style={styles.label}>Wat ging goed?</Text>
                <TextInput
                    style={[styles.input, styles.textarea]}
                    multiline
                    placeholder="Wat werkte goed tijdens deze training?"
                    placeholderTextColor={COLORS.mutedText}
                    value={whatWentWell}
                    onChangeText={setWhatWentWell}
                />

                <Text style={styles.label}>Wat kan beter?</Text>
                <TextInput
                    style={[styles.input, styles.textarea]}
                    multiline
                    placeholder="Wat wil je verbeteren?"
                    placeholderTextColor={COLORS.mutedText}
                    value={whatToImprove}
                    onChangeText={setWhatToImprove}
                />

                <Text style={styles.label}>Aandacht voor volgende keer</Text>
                <TextInput
                    style={[styles.input, styles.textarea]}
                    multiline
                    placeholder="Waar wil je volgende training op letten?"
                    placeholderTextColor={COLORS.mutedText}
                    value={nextTimeNotes}
                    onChangeText={setNextTimeNotes}
                />

                <Text style={styles.label}>Opkomst / bijzonderheden</Text>
                <TextInput
                    style={[styles.input, styles.textarea]}
                    multiline
                    placeholder="Bijv. lage opkomst, blessure, keeper afwezig..."
                    placeholderTextColor={COLORS.mutedText}
                    value={attendanceNote}
                    onChangeText={setAttendanceNote}
                />

                <Pressable
                    style={styles.saveNoteButton}
                    onPress={handleSaveNote}
                    disabled={savingNote}
                >
                    {savingNote ? (
                        <ActivityIndicator color={COLORS.text} />
                    ) : (
                        <Text style={styles.saveNoteButtonText}>Evaluatie opslaan</Text>
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
        position: "relative",
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.lg,
    },
    headerContent: {
        marginBottom: SPACING.lg,
    },
    title: {
        color: COLORS.text,
        fontSize: 26,
        fontWeight: "900",
        marginBottom: 10,
    },
    trainingDate: {
        color: COLORS.primaryLight,
        fontSize: 15,
        fontWeight: "700",
        marginBottom: 6,
    },
    trainingTeam: {
        color: COLORS.text,
        fontSize: 15,
        fontWeight: "700",
        marginBottom: 6,
    },
    totalTime: {
        color: COLORS.accent,
        fontSize: 15,
        fontWeight: "800",
    },
    text: {
        color: COLORS.mutedText,
        fontSize: 16,
        lineHeight: 24,
        textAlign: "center",
    },
    actionRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: SPACING.xl,
        flexWrap: "wrap",
    },
    iconActionButton: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: COLORS.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    iconActionButtonDisabled: {
        opacity: 0.7,
    },
    deleteIconButton: {
        width: 40,
        height: 40,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#C0392B",
        backgroundColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
    },
    deleteIconButtonDisabled: {
        opacity: 0.7,
    },
    block: {
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.md,
        borderWidth: 1,
        backgroundColor: COLORS.surfaceLight,
        borderColor: COLORS.border,
    },
    blockHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 10,
    },
    numberBadge: {
        width: 28,
        height: 28,
        borderRadius: 999,
        backgroundColor: COLORS.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    numberBadgeText: {
        color: COLORS.text,
        fontWeight: "900",
        fontSize: 14,
    },
    blockTitle: {
        color: COLORS.primaryLight,
        fontSize: 16,
        fontWeight: "800",
    },
    blockText: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 6,
    },
    blockTime: {
        color: COLORS.mutedText,
        fontSize: 15,
        marginBottom: 8,
    },
    blockNotes: {
        color: COLORS.text,
        fontSize: 14,
        lineHeight: 22,
        marginBottom: 8,
    },
    linkText: {
        color: COLORS.accent,
        fontSize: 14,
        fontWeight: "800",
    },
    notesTitle: {
        color: COLORS.text,
        fontSize: 22,
        fontWeight: "900",
        marginBottom: SPACING.md,
    },
    label: {
        color: COLORS.primaryLight,
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 8,
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
    saveNoteButton: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        alignItems: "center",
    },
    saveNoteButtonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 16,
    },
});