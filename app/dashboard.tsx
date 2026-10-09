import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

type ProfileRow = {
    id: string;
    email: string | null;
    full_name: string | null;
    role: "super_admin" | "head_trainer" | "trainer";
    club_id: number | null;
};

type TeamRow = {
    id: number;
    name: string;
    club_id: number;
};

type TeamTrainerRow = {
    team_id: number;
    user_id: string;
};

type TrainingRow = {
    id: number;
    user_id: string;
    title: string;
    team_id: number | null;
    training_date: string | null;
    created_at: string;
};

type TrainingEvaluationRow = {
    training_id: number;
    author_user_id: string;
    what_went_well: string | null;
    what_to_improve: string | null;
    next_time_notes: string | null;
    attendance_note: string | null;
};

type CategoryRow = {
    slug: string;
    title: string;
};

type ExerciseRow = {
    id: number;
    category_slug: string;
    title: string;
};

type TrainingBlockRow = {
    training_id: number;
    exercise_id: number | null;
};

type DashboardData = {
    clubName: string;
    profiles: ProfileRow[];
    teams: TeamRow[];
    teamTrainers: TeamTrainerRow[];
    trainings: TrainingRow[];
    categories: CategoryRow[];
    exercises: ExerciseRow[];
    trainingBlocks: TrainingBlockRow[];
    evaluations: TrainingEvaluationRow[];
};

function formatDate(dateString: string | null) {
    if (!dateString) return "Geen datum";
    const [year, month, day] = dateString.split("-");
    if (!year || !month || !day) return dateString;
    return `${day}-${month}-${year}`;
}

function displayName(profile: ProfileRow | undefined) {
    if (!profile) return "Onbekende trainer";
    return profile.full_name?.trim() || profile.email || "Onbekende trainer";
}

function SectionTitle({ icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
    return (
        <View style={styles.sectionTitleRow}>
            <View style={styles.sectionIcon}>
                <Ionicons name={icon} size={20} color={COLORS.primaryLight} />
            </View>
            <View style={styles.sectionTitleTextWrap}>
                <Text style={styles.sectionTitle}>{title}</Text>
                {!!subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
            </View>
        </View>
    );
}

function StatCard({
    icon,
    value,
    label,
    wide,
}: {
    icon: any;
    value: string | number;
    label: string;
    wide?: boolean;
}) {
    return (
        <View style={[styles.statCard, wide && styles.statCardWide]}>
            <View style={styles.statIcon}>
                <Ionicons name={icon} size={22} color={COLORS.accent} />
            </View>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
}

function ProgressRow({
    label,
    value,
    maxValue,
    meta,
}: {
    label: string;
    value: number;
    maxValue: number;
    meta?: string;
}) {
    const percentage = maxValue <= 0 ? 0 : Math.max(4, Math.round((value / maxValue) * 100));

    return (
        <View style={styles.progressItem}>
            <View style={styles.progressHeader}>
                <Text style={styles.progressLabel} numberOfLines={1}>{label}</Text>
                <Text style={styles.progressValue}>{meta || String(value)}</Text>
            </View>
            <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${percentage}%` }]} />
            </View>
        </View>
    );
}

export default function DashboardScreen() {
    const { user, role, loading: authLoading } = useAuth();
    const { width } = useWindowDimensions();
    const isDesktop = width >= 900;
    const canView = role === "head_trainer" || role === "super_admin";

    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [errorText, setErrorText] = useState("");

    useFocusEffect(
        useCallback(() => {
            loadDashboard();
        }, [user, role])
    );

    async function loadDashboard(manualRefresh = false) {
        try {
            if (manualRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            setErrorText("");

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            if (!user || !canView) {
                setData(null);
                return;
            }

            const { data: ownProfileData, error: ownProfileError } = await supabase
                .from("profiles")
                .select("id, email, full_name, role, club_id, clubs(name)")
                .eq("id", user.id)
                .single();

            if (ownProfileError) throw ownProfileError;

            const ownProfile = ownProfileData as any;
            const clubId = ownProfile.club_id as number | null;
            const clubRelation = Array.isArray(ownProfile.clubs)
                ? ownProfile.clubs[0] ?? null
                : ownProfile.clubs ?? null;

            let teamsQuery = supabase
                .from("teams")
                .select("id, name, club_id")
                .order("name", { ascending: true });

            let profilesQuery = supabase
                .from("profiles")
                .select("id, email, full_name, role, club_id")
                .in("role", ["trainer", "head_trainer"])
                .order("full_name", { ascending: true, nullsFirst: false });

            if (clubId) {
                teamsQuery = teamsQuery.eq("club_id", clubId);
                profilesQuery = profilesQuery.eq("club_id", clubId);
            }

            const [
                { data: teamsData, error: teamsError },
                { data: profilesData, error: profilesError },
                { data: categoriesData, error: categoriesError },
                { data: exercisesData, error: exercisesError },
            ] = await Promise.all([
                teamsQuery,
                profilesQuery,
                supabase.from("categories").select("slug, title").order("id", { ascending: true }),
                supabase.from("exercises").select("id, category_slug, title").order("title", { ascending: true }),
            ]);

            if (teamsError) throw teamsError;
            if (profilesError) throw profilesError;
            if (categoriesError) throw categoriesError;
            if (exercisesError) throw exercisesError;

            const teams = (teamsData as TeamRow[]) || [];
            const profiles = (profilesData as ProfileRow[]) || [];
            const categories = (categoriesData as CategoryRow[]) || [];
            const exercises = (exercisesData as ExerciseRow[]) || [];
            const teamIds = teams.map((team) => team.id);

            let teamTrainers: TeamTrainerRow[] = [];
            let trainings: TrainingRow[] = [];
            let trainingBlocks: TrainingBlockRow[] = [];
            let evaluations: TrainingEvaluationRow[] = [];

            if (teamIds.length > 0) {
                const [
                    { data: teamTrainersData, error: teamTrainersError },
                    { data: trainingsData, error: trainingsError },
                ] = await Promise.all([
                    supabase
                        .from("team_trainers")
                        .select("team_id, user_id")
                        .in("team_id", teamIds),
                    supabase
                        .from("trainings")
                        .select("id, user_id, title, team_id, training_date, created_at")
                        .in("team_id", teamIds)
                        .order("created_at", { ascending: false }),
                ]);

                if (teamTrainersError) throw teamTrainersError;
                if (trainingsError) throw trainingsError;

                teamTrainers = (teamTrainersData as TeamTrainerRow[]) || [];
                trainings = (trainingsData as TrainingRow[]) || [];

                const trainingIds = trainings.map((training) => training.id);

                if (trainingIds.length > 0) {
                    const [
                        { data: blockData, error: blockError },
                        { data: evaluationData, error: evaluationError },
                    ] = await Promise.all([
                        supabase.from("training_blocks")
                            .select("training_id, exercise_id")
                            .in("training_id", trainingIds),
                        supabase.from("training_notes")
                            .select("training_id, author_user_id, what_went_well, what_to_improve, next_time_notes, attendance_note")
                            .in("training_id", trainingIds),
                    ]);

                    if (blockError) throw blockError;
                    if (evaluationError) throw evaluationError;
                    trainingBlocks = (blockData as TrainingBlockRow[]) || [];
                    evaluations = (evaluationData as TrainingEvaluationRow[]) || [];
                }
            }

            setData({
                clubName: clubRelation?.name || "Club",
                profiles,
                teams,
                teamTrainers,
                trainings,
                categories,
                exercises,
                trainingBlocks,
                evaluations,
            });
        } catch (error) {
            setErrorText(
                error instanceof Error ? error.message : "Dashboard laden mislukt."
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    const stats = useMemo(() => {
        if (!data) return null;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const todayYmd = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0"),
        ].join("-");

        const profileById = new Map(data.profiles.map((profile) => [profile.id, profile]));
        const teamById = new Map(data.teams.map((team) => [team.id, team]));
        const exerciseById = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));

        const trainingsThisMonth = data.trainings.filter((training) => {
            const created = new Date(training.created_at);
            return created.getMonth() === currentMonth && created.getFullYear() === currentYear;
        }).length;

        const upcomingTrainings = data.trainings.filter(
            (training) => !!training.training_date && training.training_date >= todayYmd
        ).length;

        const trainerTrainingCounts = new Map<string, number>();
        data.trainings.forEach((training) => {
            trainerTrainingCounts.set(
                training.user_id,
                (trainerTrainingCounts.get(training.user_id) || 0) + 1
            );
        });

        const trainingsPerTrainer = data.profiles
            .map((profile) => ({
                id: profile.id,
                label: displayName(profile),
                value: trainerTrainingCounts.get(profile.id) || 0,
            }))
            .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

        const teamTrainerCounts = new Map<number, number>();
        data.teamTrainers.forEach((link) => {
            teamTrainerCounts.set(link.team_id, (teamTrainerCounts.get(link.team_id) || 0) + 1);
        });

        const trainersPerTeam = data.teams
            .map((team) => ({
                id: team.id,
                label: team.name,
                value: teamTrainerCounts.get(team.id) || 0,
            }))
            .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

        const teamTrainingCounts = new Map<number, number>();
        data.trainings.forEach((training) => {
            if (!training.team_id) return;
            teamTrainingCounts.set(
                training.team_id,
                (teamTrainingCounts.get(training.team_id) || 0) + 1
            );
        });

        const trainingsPerTeam = data.teams
            .map((team) => ({
                id: team.id,
                label: team.name,
                value: teamTrainingCounts.get(team.id) || 0,
            }))
            .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

        const categoryExerciseCounts = new Map<string, number>();
        data.exercises.forEach((exercise) => {
            categoryExerciseCounts.set(
                exercise.category_slug,
                (categoryExerciseCounts.get(exercise.category_slug) || 0) + 1
            );
        });

        const exercisesPerCategory = data.categories
            .map((category) => ({
                id: category.slug,
                label: category.title,
                value: categoryExerciseCounts.get(category.slug) || 0,
            }))
            .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

        const exerciseUsageCounts = new Map<number, number>();
        data.trainingBlocks.forEach((block) => {
            if (!block.exercise_id) return;
            exerciseUsageCounts.set(
                block.exercise_id,
                (exerciseUsageCounts.get(block.exercise_id) || 0) + 1
            );
        });

        const mostUsedExerciseEntry = Array.from(exerciseUsageCounts.entries())
            .sort((a, b) => b[1] - a[1])[0];
        const mostUsedExercise = mostUsedExerciseEntry
            ? {
                label: exerciseById.get(mostUsedExerciseEntry[0])?.title || "Onbekende oefening",
                value: mostUsedExerciseEntry[1],
            }
            : null;

        const mostActiveTrainer = trainingsPerTrainer.find((item) => item.value > 0) || null;
        const busiestTeam = trainingsPerTeam.find((item) => item.value > 0) || null;

        const recentTrainings = data.trainings.slice(0, 6).map((training) => ({
            ...training,
            trainer: displayName(profileById.get(training.user_id)),
            team: training.team_id ? teamById.get(training.team_id)?.name || "Onbekend team" : "Geen team",
        }));

        const trainingById = new Map(data.trainings.map((training) => [training.id, training]));
        const completedTrainings = data.evaluations
            .filter((evaluation) =>
                [evaluation.what_went_well, evaluation.what_to_improve, evaluation.next_time_notes, evaluation.attendance_note]
                    .some((value) => !!value?.trim())
            )
            .map((evaluation) => {
                const training = trainingById.get(evaluation.training_id);
                if (!training) return null;
                return {
                    ...training,
                    trainer: displayName(profileById.get(training.user_id)),
                    evaluator: displayName(profileById.get(evaluation.author_user_id)),
                    team: training.team_id ? teamById.get(training.team_id)?.name || "Onbekend team" : "Geen team",
                    evaluation,
                };
            })
            .filter((training): training is NonNullable<typeof training> => training !== null)
            .sort((a, b) => (b.training_date || "").localeCompare(a.training_date || ""));

        const assignedTrainerIds = new Set(data.teamTrainers.map((link) => link.user_id));
        const unassignedTrainers = data.profiles.filter(
            (profile) => !assignedTrainerIds.has(profile.id)
        ).length;

        return {
            trainingsThisMonth,
            upcomingTrainings,
            trainingsPerTrainer,
            trainersPerTeam,
            trainingsPerTeam,
            exercisesPerCategory,
            mostUsedExercise,
            mostActiveTrainer,
            busiestTeam,
            recentTrainings,
            completedTrainings,
            unassignedTrainers,
        };
    }, [data]);

    if (authLoading || loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Dashboard laden...</Text>
            </View>
        );
    }

    if (!user || !canView) {
        return (
            <View style={styles.center}>
                <Ionicons name="lock-closed-outline" size={42} color={COLORS.mutedText} />
                <Text style={styles.accessTitle}>Geen toegang</Text>
                <Text style={styles.accessText}>
                    Dit dashboard is beschikbaar voor hoofdtrainers en beheerders.
                </Text>
            </View>
        );
    }

    if (errorText || !data || !stats) {
        return (
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={42} color={COLORS.mutedText} />
                <Text style={styles.accessTitle}>Dashboard niet beschikbaar</Text>
                <Text style={styles.accessText}>{errorText || "Er konden geen gegevens worden geladen."}</Text>
                <Pressable style={styles.retryButton} onPress={() => loadDashboard(true)}>
                    <Text style={styles.retryButtonText}>Opnieuw proberen</Text>
                </Pressable>
            </View>
        );
    }

    const trainerMax = Math.max(1, ...stats.trainingsPerTrainer.map((item) => item.value));
    const teamTrainerMax = Math.max(1, ...stats.trainersPerTeam.map((item) => item.value));
    const teamTrainingMax = Math.max(1, ...stats.trainingsPerTeam.map((item) => item.value));
    const categoryMax = Math.max(1, ...stats.exercisesPerCategory.map((item) => item.value));

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.page}>
                <View style={styles.hero}>
                    <View style={styles.heroTop}>
                        <View style={styles.heroIcon}>
                            <Ionicons name="stats-chart-outline" size={28} color={COLORS.text} />
                        </View>
                        <Pressable
                            style={styles.refreshButton}
                            onPress={() => loadDashboard(true)}
                            disabled={refreshing}
                        >
                            {refreshing ? (
                                <ActivityIndicator size="small" color={COLORS.text} />
                            ) : (
                                <Ionicons name="refresh-outline" size={20} color={COLORS.text} />
                            )}
                        </Pressable>
                    </View>
                    <Text style={styles.eyebrow}>HOOFDTRAINER DASHBOARD</Text>
                    <Text style={styles.heroTitle}>{data.clubName}</Text>
                    <Text style={styles.heroText}>
                        In één overzicht zie je hoe actief de trainers en teams zijn en hoe de oefenbibliotheek is opgebouwd.
                    </Text>

                    <Pressable
                        style={styles.weekOverviewButton}
                        onPress={() => router.push("/weekoverzicht")}
                    >
                        <View style={styles.weekOverviewIcon}>
                            <Ionicons name="calendar-outline" size={22} color={COLORS.text} />
                        </View>
                        <View style={styles.weekOverviewTextWrap}>
                            <Text style={styles.weekOverviewTitle}>Clubweekoverzicht</Text>
                            <Text style={styles.weekOverviewText}>
                                Bekijk per team de trainers en trainingen van deze week.
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward-outline" size={22} color={COLORS.primaryLight} />
                    </Pressable>
                </View>

                <View style={styles.statsGrid}>
                    <StatCard icon="people-outline" value={data.profiles.length} label="Trainers totaal" />
                    <StatCard icon="shield-outline" value={data.teams.length} label="Teams" />
                    <StatCard icon="clipboard-outline" value={data.trainings.length} label="Trainingen gemaakt" />
                    <StatCard icon="calendar-outline" value={stats.trainingsThisMonth} label="Gemaakt deze maand" />
                    <StatCard icon="time-outline" value={stats.upcomingTrainings} label="Komende trainingen" />
                    <StatCard icon="football-outline" value={data.exercises.length} label="Oefeningen" />
                </View>

                <View style={[styles.highlightsGrid, isDesktop && styles.highlightsGridDesktop]}>
                    <View style={styles.highlightCard}>
                        <Ionicons name="trophy-outline" size={24} color={COLORS.accent} />
                        <Text style={styles.highlightLabel}>Meest actieve trainer</Text>
                        <Text style={styles.highlightValue}>
                            {stats.mostActiveTrainer?.label || "Nog geen data"}
                        </Text>
                        <Text style={styles.highlightMeta}>
                            {stats.mostActiveTrainer ? `${stats.mostActiveTrainer.value} trainingen` : "Maak eerst trainingen aan"}
                        </Text>
                    </View>

                    <View style={styles.highlightCard}>
                        <Ionicons name="flash-outline" size={24} color={COLORS.accent} />
                        <Text style={styles.highlightLabel}>Actiefste team</Text>
                        <Text style={styles.highlightValue}>
                            {stats.busiestTeam?.label || "Nog geen data"}
                        </Text>
                        <Text style={styles.highlightMeta}>
                            {stats.busiestTeam ? `${stats.busiestTeam.value} trainingen` : "Nog geen teamdata"}
                        </Text>
                    </View>

                    <View style={styles.highlightCard}>
                        <Ionicons name="barbell-outline" size={24} color={COLORS.accent} />
                        <Text style={styles.highlightLabel}>Meest gebruikte oefening</Text>
                        <Text style={styles.highlightValue}>
                            {stats.mostUsedExercise?.label || "Nog geen data"}
                        </Text>
                        <Text style={styles.highlightMeta}>
                            {stats.mostUsedExercise ? `${stats.mostUsedExercise.value}× gebruikt` : "Nog geen gebruik gemeten"}
                        </Text>
                    </View>

                    <View style={styles.highlightCard}>
                        <Ionicons name="person-remove-outline" size={24} color={COLORS.accent} />
                        <Text style={styles.highlightLabel}>Nog zonder team</Text>
                        <Text style={styles.highlightValue}>{stats.unassignedTrainers}</Text>
                        <Text style={styles.highlightMeta}>trainers zonder teamkoppeling</Text>
                    </View>
                </View>

                <View style={styles.panel}>
                    <SectionTitle
                        icon="checkmark-done-outline"
                        title="Afgeronde trainingen"
                        subtitle="Trainingen met een ingevulde evaluatie"
                    />
                    {stats.completedTrainings.length === 0 ? (
                        <Text style={styles.emptyText}>Er zijn nog geen trainingen geëvalueerd.</Text>
                    ) : (
                        stats.completedTrainings.map((training) => (
                            <View key={training.id} style={styles.evaluationCard}>
                                <Pressable onPress={() => router.push(`/training/${training.id}`)}>
                                    <Text style={styles.evaluationTitle}>{training.title}  <Ionicons name="arrow-forward-outline" size={16} color={COLORS.primaryLight} /></Text>
                                    <Text style={styles.evaluationMeta}>
                                        {formatDate(training.training_date)} · {training.team} · {training.trainer}
                                    </Text>
                                    {training.evaluator !== training.trainer && (
                                        <Text style={styles.evaluationMeta}>Evaluatie door {training.evaluator}</Text>
                                    )}
                                </Pressable>
                                {([
                                    ["Wat ging goed?", training.evaluation.what_went_well],
                                    ["Wat kan beter?", training.evaluation.what_to_improve],
                                    ["Aandacht voor volgende keer", training.evaluation.next_time_notes],
                                    ["Opkomst / bijzonderheden", training.evaluation.attendance_note],
                                ] as const).filter(([, value]) => !!value?.trim()).map(([label, value]) => (
                                    <View key={label} style={styles.evaluationSection}>
                                        <Text style={styles.evaluationLabel}>{label}</Text>
                                        <Text style={styles.evaluationBody}>{value}</Text>
                                    </View>
                                ))}
                            </View>
                        ))
                    )}
                </View>

                <View style={[styles.columns, isDesktop && styles.columnsDesktop]}>
                    <View style={[styles.panel, isDesktop && styles.panelHalf]}>
                        <SectionTitle
                            icon="person-outline"
                            title="Trainingen per trainer"
                            subtitle="Wie maakt de meeste trainingen?"
                        />
                        {stats.trainingsPerTrainer.length === 0 ? (
                            <Text style={styles.emptyText}>Nog geen trainers gevonden.</Text>
                        ) : (
                            stats.trainingsPerTrainer.map((item) => (
                                <ProgressRow
                                    key={item.id}
                                    label={item.label}
                                    value={item.value}
                                    maxValue={trainerMax}
                                    meta={`${item.value} training${item.value === 1 ? "" : "en"}`}
                                />
                            ))
                        )}
                    </View>

                    <View style={[styles.panel, isDesktop && styles.panelHalf]}>
                        <SectionTitle
                            icon="people-circle-outline"
                            title="Trainers per team"
                            subtitle="Verdeling van de trainers over de teams"
                        />
                        {stats.trainersPerTeam.map((item) => (
                            <ProgressRow
                                key={item.id}
                                label={item.label}
                                value={item.value}
                                maxValue={teamTrainerMax}
                                meta={`${item.value} trainer${item.value === 1 ? "" : "s"}`}
                            />
                        ))}
                    </View>
                </View>

                <View style={[styles.columns, isDesktop && styles.columnsDesktop]}>
                    <View style={[styles.panel, isDesktop && styles.panelHalf]}>
                        <SectionTitle
                            icon="analytics-outline"
                            title="Trainingen per team"
                            subtitle="Welke teams gebruiken de app het meest?"
                        />
                        {stats.trainingsPerTeam.map((item) => (
                            <ProgressRow
                                key={item.id}
                                label={item.label}
                                value={item.value}
                                maxValue={teamTrainingMax}
                                meta={`${item.value} training${item.value === 1 ? "" : "en"}`}
                            />
                        ))}
                    </View>

                    <View style={[styles.panel, isDesktop && styles.panelHalf]}>
                        <SectionTitle
                            icon="grid-outline"
                            title="Oefeningen per categorie"
                            subtitle="Verdeling van de oefenbibliotheek"
                        />
                        {stats.exercisesPerCategory.map((item) => (
                            <ProgressRow
                                key={item.id}
                                label={item.label}
                                value={item.value}
                                maxValue={categoryMax}
                                meta={`${item.value} oefening${item.value === 1 ? "" : "en"}`}
                            />
                        ))}
                    </View>
                </View>

                <View style={styles.panel}>
                    <SectionTitle
                        icon="pulse-outline"
                        title="Recente activiteit"
                        subtitle="De laatst aangemaakte trainingen"
                    />
                    {stats.recentTrainings.length === 0 ? (
                        <Text style={styles.emptyText}>Nog geen trainingen aangemaakt.</Text>
                    ) : (
                        stats.recentTrainings.map((training) => (
                            <View key={training.id} style={styles.activityRow}>
                                <View style={styles.activityIcon}>
                                    <Ionicons name="clipboard-outline" size={18} color={COLORS.primaryLight} />
                                </View>
                                <View style={styles.activityMain}>
                                    <Text style={styles.activityTitle} numberOfLines={1}>{training.title}</Text>
                                    <Text style={styles.activityMeta} numberOfLines={2}>
                                        {training.trainer} · {training.team}
                                    </Text>
                                </View>
                                <Text style={styles.activityDate}>{formatDate(training.training_date)}</Text>
                            </View>
                        ))
                    )}
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    evaluationCard: { padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.lg, marginBottom: SPACING.md },
    evaluationTitle: { color: COLORS.text, fontSize: 17, fontWeight: "800", marginBottom: 5 },
    evaluationMeta: { color: COLORS.mutedText, fontSize: 13, lineHeight: 20 },
    evaluationSection: { marginTop: SPACING.md },
    evaluationLabel: { color: COLORS.primaryLight, fontSize: 13, fontWeight: "800", marginBottom: 4 },
    evaluationBody: { color: COLORS.text, fontSize: 14, lineHeight: 21 },
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    content: {
        padding: SPACING.md,
        paddingBottom: SPACING.xxl,
    },
    page: {
        width: "100%",
        maxWidth: 1200,
        alignSelf: "center",
    },
    center: {
        flex: 1,
        backgroundColor: COLORS.background,
        alignItems: "center",
        justifyContent: "center",
        padding: SPACING.lg,
    },
    loadingText: {
        color: COLORS.mutedText,
        marginTop: SPACING.md,
        fontSize: 15,
    },
    accessTitle: {
        color: COLORS.text,
        fontSize: 22,
        fontWeight: "900",
        marginTop: SPACING.md,
        marginBottom: 8,
    },
    accessText: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
        textAlign: "center",
        maxWidth: 420,
    },
    retryButton: {
        marginTop: SPACING.md,
        backgroundColor: COLORS.primary,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: RADIUS.md,
    },
    retryButtonText: {
        color: COLORS.text,
        fontWeight: "800",
    },
    hero: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.md,
    },
    heroTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: SPACING.md,
    },
    heroIcon: {
        width: 52,
        height: 52,
        borderRadius: 16,
        backgroundColor: COLORS.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    refreshButton: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: COLORS.surfaceLight,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    eyebrow: {
        color: COLORS.primaryLight,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.2,
        marginBottom: 6,
    },
    heroTitle: {
        color: COLORS.text,
        fontSize: 30,
        fontWeight: "900",
        marginBottom: 8,
    },
    heroText: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
        maxWidth: 720,
    },
    weekOverviewButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        marginTop: SPACING.md,
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.lg,
        padding: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    weekOverviewIcon: {
        width: 42,
        height: 42,
        borderRadius: 13,
        backgroundColor: COLORS.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    weekOverviewTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    weekOverviewTitle: {
        color: COLORS.text,
        fontSize: 15,
        fontWeight: "900",
        marginBottom: 3,
    },
    weekOverviewText: {
        color: COLORS.mutedText,
        fontSize: 12,
        lineHeight: 17,
    },
    statsGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: SPACING.md,
    },
    statCard: {
        width: "48.5%",
        minWidth: 145,
        flexGrow: 1,
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    statCardWide: {
        width: "100%",
    },
    statIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: COLORS.surfaceLight,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
    },
    statValue: {
        color: COLORS.text,
        fontSize: 28,
        fontWeight: "900",
        marginBottom: 3,
    },
    statLabel: {
        color: COLORS.mutedText,
        fontSize: 13,
        fontWeight: "700",
    },
    highlightsGrid: {
        gap: 10,
        marginBottom: SPACING.md,
    },
    highlightsGridDesktop: {
        flexDirection: "row",
        flexWrap: "wrap",
    },
    highlightCard: {
        flex: 1,
        minWidth: 220,
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    highlightLabel: {
        color: COLORS.primaryLight,
        fontSize: 12,
        fontWeight: "800",
        marginTop: 12,
        marginBottom: 5,
        textTransform: "uppercase",
    },
    highlightValue: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "900",
        marginBottom: 4,
    },
    highlightMeta: {
        color: COLORS.mutedText,
        fontSize: 13,
        lineHeight: 18,
    },
    columns: {
        gap: SPACING.md,
    },
    columnsDesktop: {
        flexDirection: "row",
        alignItems: "flex-start",
    },
    panel: {
        width: "100%",
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.md,
    },
    panelHalf: {
        flex: 1,
        minWidth: 0,
    },
    sectionTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: SPACING.md,
    },
    sectionIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: COLORS.surfaceLight,
        alignItems: "center",
        justifyContent: "center",
    },
    sectionTitleTextWrap: {
        flex: 1,
    },
    sectionTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "900",
    },
    sectionSubtitle: {
        color: COLORS.mutedText,
        fontSize: 12,
        marginTop: 2,
    },
    progressItem: {
        marginBottom: 14,
    },
    progressHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 7,
    },
    progressLabel: {
        color: COLORS.text,
        fontSize: 14,
        fontWeight: "700",
        flex: 1,
    },
    progressValue: {
        color: COLORS.mutedText,
        fontSize: 12,
        fontWeight: "700",
    },
    progressTrack: {
        height: 8,
        borderRadius: 999,
        backgroundColor: COLORS.surfaceLight,
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        borderRadius: 999,
        backgroundColor: COLORS.primary,
    },
    activityRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
    },
    activityIcon: {
        width: 36,
        height: 36,
        borderRadius: 11,
        backgroundColor: COLORS.surfaceLight,
        alignItems: "center",
        justifyContent: "center",
    },
    activityMain: {
        flex: 1,
        minWidth: 0,
    },
    activityTitle: {
        color: COLORS.text,
        fontSize: 14,
        fontWeight: "800",
        marginBottom: 3,
    },
    activityMeta: {
        color: COLORS.mutedText,
        fontSize: 12,
        lineHeight: 17,
    },
    activityDate: {
        color: COLORS.primaryLight,
        fontSize: 12,
        fontWeight: "800",
    },
    emptyText: {
        color: COLORS.mutedText,
        fontSize: 14,
        lineHeight: 22,
    },
});
