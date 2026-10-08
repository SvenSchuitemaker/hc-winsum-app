import Ionicons from "@expo/vector-icons/Ionicons";
import { Picker } from "@react-native-picker/picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type TeamRelation = {
    id: number;
    name: string;
    training_days: number[] | null;
};

type TrainingRow = {
    id: number;
    title: string;
    training_date: string | null;
    team_id: number | null;
    teams: TeamRelation | null;
};

type TeamOption = {
    id: number;
    name: string;
    training_days: number[] | null;
};

function formatDateForDisplay(dateString: string | null) {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-");
    if (!year || !month || !day) return dateString;
    return `${day}-${month}-${year}`;
}

function formatDayLabel(date: Date) {
    return date.toLocaleDateString("nl-NL", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
    });
}

function startOfWeek(date: Date) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    return copy;
}

function addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

function toYmd(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getDayNumberMondayFirst(date: Date) {
    const jsDay = date.getDay();
    return jsDay === 0 ? 7 : jsDay;
}

export default function PlanningScreen() {
    const { user, loading: authLoading } = useAuth();

    const [trainings, setTrainings] = useState<TrainingRow[]>([]);
    const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorText, setErrorText] = useState("");
    const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
    const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
    const [deletingTrainingId, setDeletingTrainingId] = useState<number | null>(null);
    const [trainingToDelete, setTrainingToDelete] = useState<TrainingRow | null>(null);
    const [deleteError, setDeleteError] = useState("");

    useFocusEffect(
        useCallback(() => {
            loadTrainings();
        }, [user])
    );

    async function loadTrainings() {
        try {
            setLoading(true);
            setErrorText("");

            if (!supabase) {
                setErrorText("Supabase is niet geladen.");
                setTrainings([]);
                setTeamOptions([]);
                return;
            }

            if (!user) {
                setTrainings([]);
                return;
            }

            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("club_id")
                .eq("id", user.id)
                .single();
            if (profileError) throw profileError;

            if (!profile?.club_id) {
                setTeamOptions([]);
                setTrainings([]);
                return;
            }

            const { data: teamsData, error: teamsError } = await supabase
                .from("teams")
                .select("id, name, training_days")
                .eq("club_id", profile.club_id)
                .order("name", { ascending: true });
            if (teamsError) throw teamsError;
            const clubTeams = (teamsData ?? []) as TeamOption[];
            setTeamOptions(clubTeams);
            const teamIds = clubTeams.map((team) => team.id);
            if (teamIds.length === 0) {
                setTrainings([]);
                return;
            }

            const { data, error } = await supabase
                .from("trainings")
                .select(`
  id,
  title,
  training_date,
  team_id,
  teams (
    id,
    name
  )
`)
                .not("training_date", "is", null)
                .in("team_id", teamIds)
                .order("training_date", { ascending: true });

            if (error) {
                setErrorText(error.message);
                setTrainings([]);
                return;
            }

            const mapped = ((data as any[]) || []).map((item) => ({
                ...item,
                teams: Array.isArray(item.teams) ? item.teams[0] ?? null : item.teams ?? null,
            })) as TrainingRow[];

            setTrainings(mapped);
        } catch (error) {
            setErrorText(
                error instanceof Error ? error.message : "Planning laden mislukt."
            );
            setTrainings([]);
            setTeamOptions([]);
        } finally {
            setLoading(false);
        }
    }

    function confirmDeleteTraining(training: TrainingRow) {
        setDeleteError("");
        setTrainingToDelete(training);
    }

    async function deleteTraining(trainingId: number) {
        try {
            setDeletingTrainingId(trainingId);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const { error } = await supabase
                .from("trainings")
                .delete()
                .eq("id", trainingId);

            if (error) throw error;

            setTrainings((current) =>
                current.filter((training) => training.id !== trainingId)
            );
            setTrainingToDelete(null);
            setDeleteError("");
        } catch (error) {
            setDeleteError(error instanceof Error ? error.message : "Training verwijderen mislukt.");
        } finally {
            setDeletingTrainingId(null);
        }
    }

    const filteredTrainings = useMemo(() => {
        const byTeam =
            selectedTeamId === "all"
                ? trainings
                : trainings.filter((training) => String(training.team_id) === selectedTeamId);

        const weekEnd = addDays(weekStart, 6);
        const startYmd = toYmd(weekStart);
        const endYmd = toYmd(weekEnd);

        return byTeam.filter((training) => {
            if (!training.training_date) return false;
            return training.training_date >= startYmd && training.training_date <= endYmd;
        });
    }, [trainings, selectedTeamId, weekStart]);

    const allWeekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    }, [weekStart]);

    const allowedDayNumbers = useMemo(() => {
        return new Set([3, 5]);
    }, []);

    const visibleWeekDays = useMemo(() => {
        return allWeekDays.filter((day) =>
            allowedDayNumbers.has(getDayNumberMondayFirst(day))
        );
    }, [allWeekDays, allowedDayNumbers]);

    const groupedByDay = useMemo(() => {
        const map = new Map<string, TrainingRow[]>();

        visibleWeekDays.forEach((day) => {
            map.set(toYmd(day), []);
        });

        filteredTrainings.forEach((training) => {
            if (!training.training_date) return;
            if (!map.has(training.training_date)) return;

            const current = map.get(training.training_date) || [];
            current.push(training);
            map.set(training.training_date, current);
        });

        return map;
    }, [filteredTrainings, visibleWeekDays]);

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
                <Text style={styles.title}>Planning</Text>
                <Text style={styles.text}>Log in om de clubplanning te bekijken.</Text>
            </View>
        );
    }

    if (errorText) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Planning</Text>
                <Text style={styles.text}>{errorText}</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.hero}>
                <Text style={styles.title}>Weekplanning</Text>
                <Text style={styles.text}>
                    Bekijk trainingen per week en filter op team.
                </Text>

                <View style={styles.weekNav}>
                    <Pressable
                        style={styles.weekNavButton}
                        onPress={() => setWeekStart((current) => addDays(current, -7))}
                    >
                        <Ionicons name="chevron-back-outline" size={20} color={COLORS.text} />
                    </Pressable>

                    <Text style={styles.weekLabel}>
                        {formatDateForDisplay(toYmd(weekStart))} t/m{" "}
                        {formatDateForDisplay(toYmd(addDays(weekStart, 6)))}
                    </Text>

                    <Pressable
                        style={styles.weekNavButton}
                        onPress={() => setWeekStart((current) => addDays(current, 7))}
                    >
                        <Ionicons name="chevron-forward-outline" size={20} color={COLORS.text} />
                    </Pressable>
                </View>

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
            </View>

            {visibleWeekDays.map((day) => {
                const key = toYmd(day);
                const dayTrainings = groupedByDay.get(key) || [];

                return (
                    <View key={key} style={styles.daySection}>
                        <Text style={styles.dayTitle}>{formatDayLabel(day)}</Text>

                        {dayTrainings.length === 0 ? (
                            <Text style={styles.emptyText}>Geen training gepland.</Text>
                        ) : (
                            dayTrainings.map((training) => {
                                const isDeleting = deletingTrainingId === training.id;

                                return (
                                    <View key={training.id} style={styles.trainingCard}>
                                        <Pressable
                                            style={styles.trainingCardMain}
                                            onPress={() => router.push(`/training/${training.id}`)}
                                            disabled={isDeleting}
                                        >
                                            <Text style={styles.trainingTitle}>{training.title}</Text>
                                            <Text style={styles.trainingDate}>
                                                {formatDateForDisplay(training.training_date)}
                                            </Text>
                                            <Text style={styles.trainingTeam}>
                                                Team: {training.teams?.name || "Geen team"}
                                            </Text>
                                        </Pressable>

                                        <Pressable
                                            style={styles.deleteTrainingButton}
                                            onPress={() => confirmDeleteTraining(training)}
                                            disabled={isDeleting}
                                            accessibilityLabel={`${training.title} verwijderen`}
                                        >
                                            {isDeleting ? (
                                                <ActivityIndicator size="small" color="#E66B67" />
                                            ) : (
                                                <Ionicons name="trash-outline" size={20} color="#E66B67" />
                                            )}
                                        </Pressable>
                                    </View>
                                );
                            })
                        )}
                    </View>
                );
            })}
            <Modal visible={trainingToDelete !== null} transparent animationType="fade" onRequestClose={() => { if (deletingTrainingId === null) setTrainingToDelete(null); }}>
                <View style={styles.confirmOverlay}>
                    <View style={styles.confirmCard}>
                        <Text style={styles.confirmTitle}>Training verwijderen</Text>
                        <Text style={styles.confirmDescription}>
                            Weet je zeker dat je "{trainingToDelete?.title}" uit de agenda wilt verwijderen? De volledige training wordt verwijderd.
                        </Text>
                        {!!deleteError && <Text style={styles.confirmError}>{deleteError}</Text>}
                        <View style={styles.confirmActions}>
                            <Pressable style={styles.confirmCancel} onPress={() => setTrainingToDelete(null)} disabled={deletingTrainingId !== null}>
                                <Text style={styles.confirmCancelText}>Annuleren</Text>
                            </Pressable>
                            <Pressable style={styles.confirmDelete} onPress={() => { if (trainingToDelete) void deleteTraining(trainingToDelete.id); }} disabled={deletingTrainingId !== null}>
                                {deletingTrainingId !== null ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.confirmDeleteText}>Verwijderen</Text>}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    confirmOverlay: { flex: 1, justifyContent: "center", padding: SPACING.lg, backgroundColor: "rgba(0,0,0,0.7)" },
    confirmCard: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.xl, padding: SPACING.lg },
    confirmTitle: { color: COLORS.text, fontSize: 21, fontWeight: "900", marginBottom: SPACING.md },
    confirmDescription: { color: COLORS.text, fontSize: 15, lineHeight: 23, marginBottom: SPACING.md },
    confirmError: { color: "#E66B67", marginBottom: SPACING.md },
    confirmActions: { flexDirection: "row", gap: SPACING.sm, justifyContent: "flex-end" },
    confirmCancel: { borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, flex: 1, alignItems: "center" },
    confirmCancelText: { color: COLORS.text, fontWeight: "700" },
    confirmDelete: { backgroundColor: "#B83F3B", borderRadius: RADIUS.md, padding: SPACING.md, flex: 1, alignItems: "center" },
    confirmDeleteText: { color: "#FFFFFF", fontWeight: "800" },
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { padding: SPACING.md, paddingBottom: SPACING.xxl },
    center: {
        flex: 1,
        backgroundColor: COLORS.background,
        justifyContent: "center",
        alignItems: "center",
        padding: SPACING.md,
    },
    hero: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        marginBottom: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    title: {
        color: COLORS.text,
        fontSize: 24,
        fontWeight: "900",
        marginBottom: 8,
        textAlign: "center",
    },
    text: {
        color: COLORS.mutedText,
        fontSize: 16,
        lineHeight: 24,
        textAlign: "center",
        marginBottom: SPACING.md,
    },
    weekNav: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: SPACING.md,
    },
    weekNavButton: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: "center",
        justifyContent: "center",
    },
    weekLabel: {
        color: COLORS.text,
        fontSize: 14,
        fontWeight: "800",
        flex: 1,
        textAlign: "center",
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
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: "hidden",
    },
    picker: {
        color: "#111111",
        backgroundColor: "#F3F6FA",
    },
    daySection: {
        marginBottom: SPACING.lg,
    },
    dayTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "900",
        marginBottom: SPACING.md,
        textTransform: "capitalize",
    },
    emptyText: {
        color: COLORS.mutedText,
        fontSize: 14,
        lineHeight: 22,
    },
    trainingCard: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.sm,
        flexDirection: "row",
        alignItems: "center",
        overflow: "hidden",
    },
    trainingCardMain: {
        flex: 1,
        padding: SPACING.md,
        minWidth: 0,
    },
    deleteTrainingButton: {
        width: 52,
        alignSelf: "stretch",
        alignItems: "center",
        justifyContent: "center",
        borderLeftWidth: 1,
        borderLeftColor: COLORS.border,
        backgroundColor: "rgba(192,57,43,0.08)",
    },
    trainingTitle: {
        color: COLORS.text,
        fontSize: 17,
        fontWeight: "800",
        marginBottom: 4,
    },
    trainingDate: {
        color: COLORS.primaryLight,
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 4,
    },
    trainingTeam: {
        color: COLORS.mutedText,
        fontSize: 14,
        fontWeight: "700",
    },
});