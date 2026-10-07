import Ionicons from "@expo/vector-icons/Ionicons";
import { Picker } from "@react-native-picker/picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type TrainingRow = {
    id: number;
    title: string;
    training_date: string | null;
    warmup_duration: number;
    main_duration: number;
    match_duration: number;
    team_id: number | null;
    teams: { id: number; name: string } | null;
};

type TemplateRow = {
    id: number;
    title: string;
    team_id: number | null;
    teams: { id: number; name: string } | null;
};

type TeamOption = {
    id: number;
    name: string;
};

function formatDateForDisplay(dateString: string | null) {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-");
    if (!year || !month || !day) return dateString;
    return `${day}-${month}-${year}`;
}

export default function TrainingMakenScreen() {
    const { user, loading: authLoading } = useAuth();

    const [savedTrainings, setSavedTrainings] = useState<TrainingRow[]>([]);
    const [savedTemplates, setSavedTemplates] = useState<TemplateRow[]>([]);
    const [loadingTrainings, setLoadingTrainings] = useState(true);
    const [errorText, setErrorText] = useState("");
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [selectedTeamId, setSelectedTeamId] = useState<string>("all");

    async function loadTrainings() {
        try {
            setLoadingTrainings(true);
            setErrorText("");

            if (!supabase) {
                setErrorText("Supabase is niet geladen.");
                setSavedTrainings([]);
                setSavedTemplates([]);
                return;
            }

            if (!user) {
                setSavedTrainings([]);
                setSavedTemplates([]);
                return;
            }

            const [{ data: trainingData, error: trainingError }, { data: templateData, error: templateError }] =
                await Promise.all([
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
              teams ( id, name )
            `)
                        .eq("user_id", user.id)
                        .order("training_date", { ascending: true, nullsFirst: false })
                        .order("created_at", { ascending: false }),
                    supabase
                        .from("training_templates")
                        .select(`
              id,
              title,
              team_id,
              teams ( id, name )
            `)
                        .order("created_at", { ascending: false }),
                ]);

            if (trainingError) throw trainingError;
            if (templateError) throw templateError;

            const mappedTrainings = ((trainingData as any[]) || []).map((item) => ({
                ...item,
                teams: Array.isArray(item.teams) ? item.teams[0] ?? null : item.teams ?? null,
            })) as TrainingRow[];

            const mappedTemplates = ((templateData as any[]) || []).map((item) => ({
                ...item,
                teams: Array.isArray(item.teams) ? item.teams[0] ?? null : item.teams ?? null,
            })) as TemplateRow[];

            setSavedTrainings(mappedTrainings);
            setSavedTemplates(mappedTemplates);
        } catch (error) {
            setErrorText(
                error instanceof Error ? error.message : "Trainingen laden mislukt."
            );
            setSavedTrainings([]);
            setSavedTemplates([]);
        } finally {
            setLoadingTrainings(false);
        }
    }

    useFocusEffect(
        useCallback(() => {
            loadTrainings();
        }, [user])
    );

    const teamOptions = useMemo(() => {
        const map = new Map<number, TeamOption>();

        savedTrainings.forEach((training) => {
            if (training.teams?.id) {
                map.set(training.teams.id, {
                    id: training.teams.id,
                    name: training.teams.name,
                });
            }
        });

        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [savedTrainings]);

    const filteredTrainings = useMemo(() => {
        if (selectedTeamId === "all") return savedTrainings;
        return savedTrainings.filter(
            (training) => String(training.team_id) === selectedTeamId
        );
    }, [savedTrainings, selectedTeamId]);

    function confirmDelete(trainingId: number) {
        Alert.alert(
            "Training verwijderen",
            "Weet je zeker dat je deze training wilt verwijderen?",
            [
                { text: "Annuleren", style: "cancel" },
                {
                    text: "Verwijderen",
                    style: "destructive",
                    onPress: () => handleDelete(trainingId),
                },
            ]
        );
    }

    async function handleDelete(trainingId: number) {
        try {
            setDeletingId(trainingId);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const { error } = await supabase.from("trainings").delete().eq("id", trainingId);

            if (error) throw error;

            setSavedTrainings((current) =>
                current.filter((training) => training.id !== trainingId)
            );
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Verwijderen mislukt."
            );
        } finally {
            setDeletingId(null);
        }
    }

    if (authLoading || loadingTrainings) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (!user) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Mijn trainingen</Text>
                <Text style={styles.text}>Log in om je eigen trainingen te bekijken.</Text>
            </View>
        );
    }

    if (errorText) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Mijn trainingen</Text>
                <Text style={styles.text}>{errorText}</Text>
                <Pressable style={styles.button} onPress={loadTrainings}>
                    <Text style={styles.buttonText}>Opnieuw laden</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.headerCard}>
                <Text style={styles.title}>Mijn trainingen</Text>
                <Text style={styles.text}>
                    Maak een nieuwe training, start vanuit een template of dupliceer een
                    bestaande training.
                </Text>

                {teamOptions.length > 0 && (
                    <>
                        <Text style={styles.filterLabel}>Filter op team</Text>
                        <View style={styles.pickerWrap}>
                            <Picker
                                selectedValue={selectedTeamId}
                                onValueChange={(value) => setSelectedTeamId(String(value))}
                                dropdownIconColor="#111111"
                                style={styles.picker}
                            >
                                <Picker.Item label="Alle teams" value="all" color="#111111" />
                                {teamOptions.map((team) => (
                                    <Picker.Item
                                        key={team.id}
                                        label={team.name}
                                        value={String(team.id)}
                                        color="#111111"
                                    />
                                ))}
                            </Picker>
                        </View>
                    </>
                )}

                <Pressable style={styles.button} onPress={() => router.push("/training-nieuw")}>
                    <Text style={styles.buttonText}>Nieuwe training</Text>
                </Pressable>
            </View>

            <View style={styles.templatesCard}>
                <Text style={styles.sectionTitle}>Mijn templates</Text>

                {savedTemplates.length === 0 ? (
                    <Text style={styles.emptyText}>Nog geen templates opgeslagen.</Text>
                ) : (
                    savedTemplates.map((template) => (
                        <Pressable
                            key={template.id}
                            style={styles.templateItem}
                            onPress={() => router.push(`/training-nieuw?templateId=${template.id}`)}
                        >
                            <View style={styles.templateTextWrap}>
                                <Text style={styles.templateTitle}>{template.title}</Text>
                                <Text style={styles.templateMeta}>
                                    Team: {template.teams?.name || "Geen team"}
                                </Text>
                            </View>
                            <Ionicons name="copy-outline" size={20} color={COLORS.text} />
                        </Pressable>
                    ))
                )}
            </View>

            <View style={styles.listCard}>
                <Text style={styles.sectionTitle}>Opgeslagen trainingen</Text>

                {filteredTrainings.length === 0 ? (
                    <Text style={styles.emptyText}>Nog geen trainingen gevonden.</Text>
                ) : (
                    filteredTrainings.map((training) => (
                        <Pressable
                            key={training.id}
                            style={styles.trainingItem}
                            onPress={() => router.push(`/training/${training.id}`)}
                        >
                            <View style={styles.trainingTopRow}>
                                <View style={styles.trainingTopText}>
                                    <Text style={styles.trainingTitle}>{training.title}</Text>

                                    {!!training.training_date && (
                                        <Text style={styles.trainingDate}>
                                            Datum: {formatDateForDisplay(training.training_date)}
                                        </Text>
                                    )}

                                    <Text style={styles.trainingTeam}>
                                        Team: {training.teams?.name || "Geen team"}
                                    </Text>
                                </View>

                                <View style={styles.actionsCol}>
                                    <Pressable
                                        style={styles.iconButton}
                                        onPress={() =>
                                            router.push(`/training-nieuw?duplicateTrainingId=${training.id}`)
                                        }
                                    >
                                        <Ionicons name="copy-outline" size={20} color={COLORS.text} />
                                    </Pressable>

                                    <Pressable
                                        style={[
                                            styles.deleteIconButton,
                                            deletingId === training.id && styles.deleteIconButtonDisabled,
                                        ]}
                                        onPress={() => confirmDelete(training.id)}
                                        disabled={deletingId === training.id}
                                    >
                                        {deletingId === training.id ? (
                                            <ActivityIndicator size="small" color="#C0392B" />
                                        ) : (
                                            <Ionicons name="trash-outline" size={20} color="#C0392B" />
                                        )}
                                    </Pressable>
                                </View>
                            </View>
                        </Pressable>
                    ))
                )}
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
    headerCard: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.lg,
    },
    templatesCard: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.lg,
    },
    listCard: {
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
        textAlign: "center",
    },
    sectionTitle: {
        color: COLORS.text,
        fontSize: 20,
        fontWeight: "900",
        marginBottom: SPACING.md,
    },
    text: {
        color: COLORS.mutedText,
        fontSize: 16,
        lineHeight: 24,
        textAlign: "center",
        marginBottom: SPACING.md,
    },
    filterLabel: {
        color: COLORS.primaryLight,
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 8,
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
    button: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        paddingHorizontal: 18,
        alignItems: "center",
        alignSelf: "center",
    },
    buttonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 16,
    },
    emptyText: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
    },
    templateItem: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.md,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    templateTextWrap: {
        flex: 1,
    },
    templateTitle: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "800",
        marginBottom: 4,
    },
    templateMeta: {
        color: COLORS.mutedText,
        fontSize: 14,
        fontWeight: "700",
    },
    trainingItem: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    trainingTopRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
    },
    trainingTopText: {
        flex: 1,
    },
    trainingTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "800",
        marginBottom: 8,
    },
    trainingDate: {
        color: COLORS.primaryLight,
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 4,
    },
    trainingTeam: {
        color: COLORS.text,
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 4,
    },
    actionsCol: {
        gap: 10,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: COLORS.primary,
        alignItems: "center",
        justifyContent: "center",
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
});