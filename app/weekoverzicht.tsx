import Ionicons from "@expo/vector-icons/Ionicons";
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
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import TrainingStartTimePicker from "../components/TrainingStartTimePicker";

type TeamRow = {
    id: number;
    name: string;
    club_id: number;
};

type TrainerRow = {
    id: string;
    email: string | null;
    full_name: string | null;
    specialty: string | null;
};

type TeamTrainerRow = {
    team_id: number;
    user_id: string;
};

type ScheduleRow = { id: number; team_id: number; weekday: number; start_time: string };
const WEEKDAYS = ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"];

type TrainingRow = {
    id: number;
    title: string;
    training_date: string | null;
    team_id: number | null;
    user_id: string;
};

function startOfWeek(date: Date) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = copy.getDay();
    copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
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

function formatShortDate(date: Date) {
    return date.toLocaleDateString("nl-NL", {
        day: "2-digit",
        month: "2-digit",
    });
}

function formatDay(dateString: string | null) {
    if (!dateString) return "Geen datum";
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("nl-NL", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
    });
}

function trainerName(trainer: TrainerRow | undefined) {
    return trainer?.full_name?.trim() || trainer?.email || "Onbekende trainer";
}

export default function WeekOverviewScreen() {
    const { user, role, loading: authLoading } = useAuth();
    const canView = role === "head_trainer" || role === "super_admin";

    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
    const [teams, setTeams] = useState<TeamRow[]>([]);
    const [trainers, setTrainers] = useState<TrainerRow[]>([]);
    const [links, setLinks] = useState<TeamTrainerRow[]>([]);
    const [trainings, setTrainings] = useState<TrainingRow[]>([]);
    const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
    const [scheduleTeamId, setScheduleTeamId] = useState<number | null>(null);
    const [scheduleWeekday, setScheduleWeekday] = useState(1);
    const [scheduleTime, setScheduleTime] = useState("18:00");
    const [savingSchedule, setSavingSchedule] = useState(false);
    const [loading, setLoading] = useState(true);
    const [errorText, setErrorText] = useState("");

    useFocusEffect(
        useCallback(() => {
            void loadWeek();
        }, [user, role, weekStart])
    );

    async function loadWeek() {
        try {
            setLoading(true);
            setErrorText("");

            if (!supabase) throw new Error("Supabase is niet geladen.");
            if (!user || !canView) {
                setTeams([]);
                setTrainers([]);
                setLinks([]);
                setTrainings([]);
                return;
            }

            const { data: ownProfile, error: profileError } = await supabase
                .from("profiles")
                .select("club_id")
                .eq("id", user.id)
                .single();

            if (profileError) throw profileError;

            const clubId = ownProfile?.club_id as number | null;

            let teamsQuery = supabase
                .from("teams")
                .select("id, name, club_id")
                .order("name", { ascending: true });

            let trainersQuery = supabase
                .from("profiles")
                .select("id, email, full_name, specialty")
                .in("role", ["trainer", "head_trainer"]);

            if (clubId) {
                teamsQuery = teamsQuery.eq("club_id", clubId);
                trainersQuery = trainersQuery.eq("club_id", clubId);
            }

            const [
                { data: teamData, error: teamError },
                { data: trainerData, error: trainerError },
            ] = await Promise.all([teamsQuery, trainersQuery]);

            if (teamError) throw teamError;
            if (trainerError) throw trainerError;

            const loadedTeams = (teamData as TeamRow[]) || [];
            const teamIds = loadedTeams.map((team) => team.id);

            setTeams(loadedTeams);
            setTrainers((trainerData as TrainerRow[]) || []);

            if (teamIds.length === 0) {
                setLinks([]);
                setTrainings([]);
                setSchedule([]);
                return;
            }

            setScheduleTeamId((current) => current && teamIds.includes(current) ? current : teamIds[0]);

            const start = toYmd(weekStart);
            const end = toYmd(addDays(weekStart, 6));

            const [
                { data: linkData, error: linkError },
                { data: trainingData, error: trainingError },
                { data: scheduleData, error: scheduleError },
            ] = await Promise.all([
                supabase
                    .from("team_trainers")
                    .select("team_id, user_id")
                    .in("team_id", teamIds),
                supabase
                    .from("trainings")
                    .select("id, title, training_date, team_id, user_id")
                    .in("team_id", teamIds)
                    .gte("training_date", start)
                    .lte("training_date", end)
                    .order("training_date", { ascending: true }),
                supabase.from("team_training_schedule")
                    .select("id, team_id, weekday, start_time")
                    .in("team_id", teamIds)
                    .order("weekday", { ascending: true })
                    .order("start_time", { ascending: true }),
            ]);

            if (linkError) throw linkError;
            if (trainingError) throw trainingError;
            if (scheduleError) throw scheduleError;

            setLinks((linkData as TeamTrainerRow[]) || []);
            setTrainings((trainingData as TrainingRow[]) || []);
            setSchedule((scheduleData as ScheduleRow[]) || []);
        } catch (error) {
            setErrorText(
                error instanceof Error ? error.message : "Weekoverzicht laden mislukt."
            );
        } finally {
            setLoading(false);
        }
    }

    async function addSchedule() {
        if (!supabase || !scheduleTeamId || !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleTime)) {
            Alert.alert("Ongeldige tijd", "Kies een team en een geldige begintijd.");
            return;
        }
        setSavingSchedule(true);
        const { error } = await supabase.from("team_training_schedule").insert({
            team_id: scheduleTeamId, weekday: scheduleWeekday, start_time: scheduleTime,
        });
        setSavingSchedule(false);
        if (error) Alert.alert("Rooster opslaan mislukt", error.code === "23505" ? "Deze trainingstijd staat al in het rooster." : error.message);
        else void loadWeek();
    }

    async function removeSchedule(id: number) {
        if (!supabase) return;
        const { error } = await supabase.from("team_training_schedule").delete().eq("id", id);
        if (error) Alert.alert("Verwijderen mislukt", error.message);
        else setSchedule((current) => current.filter((entry) => entry.id !== id));
    }

    const trainerById = useMemo(
        () => new Map(trainers.map((trainer) => [trainer.id, trainer])),
        [trainers]
    );

    const teamCards = useMemo(() => {
        return teams.map((team) => {
            const teamLinks = links.filter((link) => link.team_id === team.id);
            const teamTrainings = trainings.filter((training) => training.team_id === team.id);

            return {
                ...team,
                trainerNames: teamLinks.map((link) => trainerName(trainerById.get(link.user_id))),
                trainings: teamTrainings,
            };
        });
    }, [teams, links, trainings, trainerById]);

    const teamsWithoutTraining = teamCards.filter((team) => team.trainings.length === 0).length;
    const teamsWithoutTrainer = teamCards.filter((team) => team.trainerNames.length === 0).length;

    if (authLoading || loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Weekoverzicht laden...</Text>
            </View>
        );
    }

    if (!user || !canView) {
        return (
            <View style={styles.center}>
                <Ionicons name="lock-closed-outline" size={42} color={COLORS.mutedText} />
                <Text style={styles.title}>Geen toegang</Text>
                <Text style={styles.centerText}>
                    Alleen hoofdtrainers en beheerders kunnen het clubweekoverzicht bekijken.
                </Text>
            </View>
        );
    }

    if (errorText) {
        return (
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={42} color={COLORS.mutedText} />
                <Text style={styles.title}>Weekoverzicht niet beschikbaar</Text>
                <Text style={styles.centerText}>{errorText}</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.page}>
                <View style={styles.hero}>
                    <Text style={styles.eyebrow}>HOOFDTRAINER</Text>
                    <Text style={styles.title}>Clubweekoverzicht</Text>
                    <Text style={styles.heroText}>
                        Zie per team welke trainers gekoppeld zijn en welke trainingen deze week gepland staan.
                    </Text>

                    <View style={styles.weekNav}>
                        <Pressable
                            style={styles.navButton}
                            onPress={() => setWeekStart((current) => addDays(current, -7))}
                        >
                            <Ionicons name="chevron-back-outline" size={20} color={COLORS.text} />
                        </Pressable>

                        <View style={styles.weekTextWrap}>
                            <Text style={styles.weekLabel}>
                                {formatShortDate(weekStart)} t/m {formatShortDate(addDays(weekStart, 6))}
                            </Text>
                            <Pressable onPress={() => setWeekStart(startOfWeek(new Date()))}>
                                <Text style={styles.todayLink}>Deze week</Text>
                            </Pressable>
                        </View>

                        <Pressable
                            style={styles.navButton}
                            onPress={() => setWeekStart((current) => addDays(current, 7))}
                        >
                            <Ionicons name="chevron-forward-outline" size={20} color={COLORS.text} />
                        </Pressable>
                    </View>
                </View>

                <View style={styles.teamCard}>
                    <Text style={styles.title}>Vast trainingsrooster</Text>
                    <Text style={styles.heroText}>Stel per team de vaste trainingsdagen en tijden in. Trainers krijgen automatisch herinneringen 24 uur en 1 uur vooraf als de training nog niet klaarstaat.</Text>
                    <Text style={styles.scheduleLabel}>Team</Text>
                    <View style={styles.scheduleOptions}>
                        {teams.map((team) => <Pressable key={team.id} onPress={() => setScheduleTeamId(team.id)} style={[styles.scheduleChip, scheduleTeamId === team.id && styles.scheduleChipActive]}>
                            <Text style={styles.scheduleChipText}>{team.name}</Text>
                        </Pressable>)}
                    </View>
                    <Text style={styles.scheduleLabel}>Trainingsdag</Text>
                    <View style={styles.scheduleOptions}>
                        {WEEKDAYS.map((day, index) => <Pressable key={day} onPress={() => setScheduleWeekday(index)} style={[styles.scheduleChip, scheduleWeekday === index && styles.scheduleChipActive]}>
                            <Text style={styles.scheduleChipText}>{day}</Text>
                        </Pressable>)}
                    </View>
                    <Text style={styles.scheduleLabel}>Begintijd</Text>
                    <TrainingStartTimePicker value={scheduleTime} onChange={setScheduleTime} />
                    <Pressable disabled={savingSchedule} onPress={() => void addSchedule()} style={styles.scheduleAdd}>
                        <Ionicons name="add-circle-outline" size={20} color={COLORS.text} />
                        <Text style={styles.scheduleChipText}>{savingSchedule ? "Opslaan..." : "Trainingstijd toevoegen"}</Text>
                    </Pressable>
                    {teams.map((team) => {
                        const entries = schedule.filter((entry) => entry.team_id === team.id);
                        return entries.length ? <View key={team.id} style={styles.scheduleGroup}>
                            <Text style={styles.teamName}>{team.name}</Text>
                            {entries.map((entry) => <View key={entry.id} style={styles.scheduleEntry}>
                                <Text style={styles.scheduleEntryText}>{WEEKDAYS[entry.weekday]} · {entry.start_time.slice(0, 5)}</Text>
                                <Pressable accessibilityLabel="Trainingstijd verwijderen" onPress={() => void removeSchedule(entry.id)} style={styles.scheduleRemove}>
                                    <Ionicons name="trash-outline" size={20} color="#F29BA8" />
                                </Pressable>
                            </View>)}
                        </View> : null;
                    })}
                </View>

                <View style={styles.summaryRow}>
                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryNumber}>{teams.length}</Text>
                        <Text style={styles.summaryLabel}>Teams</Text>
                    </View>
                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryNumber}>{trainings.length}</Text>
                        <Text style={styles.summaryLabel}>Trainingen</Text>
                    </View>
                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryNumber}>{teamsWithoutTraining}</Text>
                        <Text style={styles.summaryLabel}>Zonder training</Text>
                    </View>
                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryNumber}>{teamsWithoutTrainer}</Text>
                        <Text style={styles.summaryLabel}>Zonder trainer</Text>
                    </View>
                </View>

                {teamCards.map((team) => (
                    <View key={team.id} style={styles.teamCard}>
                        <View style={styles.teamHeader}>
                            <View style={styles.teamIcon}>
                                <Ionicons name="shield-outline" size={22} color={COLORS.primaryLight} />
                            </View>
                            <View style={styles.teamHeaderText}>
                                <Text style={styles.teamName}>{team.name}</Text>
                                <Text style={styles.teamTrainerText}>
                                    {team.trainerNames.length > 0
                                        ? team.trainerNames.join(" · ")
                                        : "Nog geen trainer gekoppeld"}
                                </Text>
                            </View>
                        </View>

                        {team.trainings.length === 0 ? (
                            <View style={styles.warningBox}>
                                <Ionicons name="warning-outline" size={18} color="#F0C36B" />
                                <Text style={styles.warningText}>Geen training gepland in deze week.</Text>
                            </View>
                        ) : (
                            team.trainings.map((training) => (
                                <Pressable
                                    key={training.id}
                                    style={styles.trainingRow}
                                    onPress={() => router.push(`/training/${training.id}`)}
                                >
                                    <View style={styles.trainingMain}>
                                        <Text style={styles.trainingTitle}>{training.title}</Text>
                                        <Text style={styles.trainingMeta}>
                                            {formatDay(training.training_date)} · gemaakt door {trainerName(trainerById.get(training.user_id))}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward-outline" size={20} color={COLORS.primaryLight} />
                                </Pressable>
                            ))
                        )}
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scheduleLabel: { color: COLORS.primaryLight, fontSize: 14, fontWeight: "800", marginBottom: 8 },
    scheduleOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
    scheduleChip: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border },
    scheduleChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryLight },
    scheduleChipText: { color: COLORS.text, fontWeight: "800" },
    scheduleAdd: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 16 },
    scheduleGroup: { paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 10 },
    scheduleEntry: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
    scheduleEntryText: { color: COLORS.text, fontSize: 14 },
    scheduleRemove: { padding: 9 },
    container: { flex: 1, backgroundColor: COLORS.background },
    content: { padding: SPACING.md, paddingBottom: SPACING.xxl },
    page: { width: "100%", maxWidth: 1000, alignSelf: "center" },
    center: {
        flex: 1,
        backgroundColor: COLORS.background,
        alignItems: "center",
        justifyContent: "center",
        padding: SPACING.lg,
    },
    loadingText: { color: COLORS.mutedText, marginTop: SPACING.md },
    centerText: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
        textAlign: "center",
        maxWidth: 430,
    },
    hero: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.md,
    },
    eyebrow: {
        color: COLORS.primaryLight,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.2,
        marginBottom: 5,
    },
    title: {
        color: COLORS.text,
        fontSize: 27,
        fontWeight: "900",
        marginBottom: 7,
    },
    heroText: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
        marginBottom: SPACING.md,
    },
    weekNav: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.lg,
        padding: 10,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    navButton: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: COLORS.background,
        alignItems: "center",
        justifyContent: "center",
    },
    weekTextWrap: {
        flex: 1,
        alignItems: "center",
    },
    weekLabel: {
        color: COLORS.text,
        fontSize: 14,
        fontWeight: "900",
    },
    todayLink: {
        color: COLORS.accent,
        fontSize: 12,
        fontWeight: "800",
        marginTop: 3,
    },
    summaryRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: SPACING.md,
    },
    summaryCard: {
        flexGrow: 1,
        width: "47%",
        minWidth: 140,
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    summaryNumber: {
        color: COLORS.text,
        fontSize: 25,
        fontWeight: "900",
        marginBottom: 3,
    },
    summaryLabel: {
        color: COLORS.mutedText,
        fontSize: 12,
        fontWeight: "700",
    },
    teamCard: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: SPACING.md,
        marginBottom: SPACING.md,
    },
    teamHeader: {
        flexDirection: "row",
        gap: 11,
        alignItems: "center",
        marginBottom: SPACING.md,
    },
    teamIcon: {
        width: 42,
        height: 42,
        borderRadius: 13,
        backgroundColor: COLORS.surfaceLight,
        alignItems: "center",
        justifyContent: "center",
    },
    teamHeaderText: { flex: 1 },
    teamName: {
        color: COLORS.text,
        fontSize: 19,
        fontWeight: "900",
        marginBottom: 3,
    },
    teamTrainerText: {
        color: COLORS.mutedText,
        fontSize: 13,
        lineHeight: 18,
    },
    warningBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.md,
        padding: 12,
    },
    warningText: {
        color: "#F0C36B",
        fontSize: 13,
        fontWeight: "700",
        flex: 1,
    },
    trainingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.md,
        padding: 12,
        marginTop: 8,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    trainingMain: { flex: 1 },
    trainingTitle: {
        color: COLORS.text,
        fontSize: 15,
        fontWeight: "800",
        marginBottom: 4,
    },
    trainingMeta: {
        color: COLORS.mutedText,
        fontSize: 12,
        lineHeight: 17,
    },
});
