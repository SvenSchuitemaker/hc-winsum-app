import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type TeamRow = {
    id: number;
    name: string;
    club_id: number;
};

type TrainerRow = {
    id: string;
    full_name: string | null;
    email: string | null;
    role: "super_admin" | "head_trainer" | "trainer" | null;
    club_id: number | null;
};

type TeamTrainerRow = {
    user_id: string;
};

type TrainingRow = {
    id: number;
    title: string;
    training_date: string | null;
};

function formatDateForDisplay(dateString: string | null) {
    if (!dateString) return "Geen datum";
    const [year, month, day] = dateString.split("-");
    if (!year || !month || !day) return dateString;
    return `${day}-${month}-${year}`;
}

export default function TeamDetailsScreen() {
    const { user, role, loading: authLoading } = useAuth();
    const { teamId } = useLocalSearchParams<{ teamId: string }>();
    const canManageTeam = role === "head_trainer" || role === "super_admin";

    const [team, setTeam] = useState<TeamRow | null>(null);
    const [trainers, setTrainers] = useState<TrainerRow[]>([]);
    const [linkedTrainerIds, setLinkedTrainerIds] = useState<string[]>([]);
    const [upcomingTrainings, setUpcomingTrainings] = useState<TrainingRow[]>([]);
    const [teamName, setTeamName] = useState("");
    const [searchText, setSearchText] = useState("");
    const [loading, setLoading] = useState(true);
    const [savingTeamName, setSavingTeamName] = useState(false);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
    const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(null);
    const [errorText, setErrorText] = useState("");

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [user, role, teamId])
    );

    async function loadData() {
        try {
            setLoading(true);
            setErrorText("");

            if (!supabase) {
                setErrorText("Supabase is niet geladen.");
                return;
            }

            if (!user || !teamId) {
                setTeam(null);
                setTrainers([]);
                setLinkedTrainerIds([]);
                setUpcomingTrainings([]);
                return;
            }

            const numericTeamId = Number(teamId);

            const { data: teamData, error: teamError } = await supabase
                .from("teams")
                .select("id, name, club_id")
                .eq("id", numericTeamId)
                .single();

            if (teamError) throw teamError;

            const loadedTeam = teamData as TeamRow;
            setTeam(loadedTeam);
            setTeamName(loadedTeam.name);

            const [
                { data: trainersData, error: trainersError },
                { data: linkedData, error: linkedError },
                { data: trainingsData, error: trainingsError },
            ] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("id, full_name, email, role, club_id")
                    .eq("club_id", loadedTeam.club_id)
                    .in("role", ["trainer", "head_trainer"])
                    .order("full_name", { ascending: true }),
                supabase
                    .from("team_trainers")
                    .select("user_id")
                    .eq("team_id", numericTeamId),
                supabase
                    .from("trainings")
                    .select("id, title, training_date")
                    .eq("team_id", numericTeamId)
                    .order("training_date", { ascending: true })
                    .limit(10),
            ]);

            if (trainersError) throw trainersError;
            if (linkedError) throw linkedError;
            if (trainingsError) throw trainingsError;

            setTrainers((trainersData as TrainerRow[]) || []);
            setLinkedTrainerIds(
                ((linkedData as TeamTrainerRow[]) || []).map((row) => row.user_id)
            );
            setUpcomingTrainings((trainingsData as TrainingRow[]) || []);
        } catch (error) {
            setErrorText(
                error instanceof Error ? error.message : "Gegevens laden mislukt."
            );
            setTeam(null);
            setTrainers([]);
            setLinkedTrainerIds([]);
            setUpcomingTrainings([]);
        } finally {
            setLoading(false);
        }
    }

    async function handleRenameTeam() {
        if (!team || !teamName.trim()) {
            Alert.alert("Ontbrekende naam", "Vul een teamnaam in.");
            return;
        }

        try {
            setSavingTeamName(true);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const { error } = await supabase
                .from("teams")
                .update({ name: teamName.trim() })
                .eq("id", team.id);

            if (error) throw error;

            setTeam((current) => (current ? { ...current, name: teamName.trim() } : current));
            Alert.alert("Gelukt", "Teamnaam opgeslagen.");
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Opslaan mislukt."
            );
        } finally {
            setSavingTeamName(false);
        }
    }

    async function toggleTrainer(userId: string) {
        if (!team) {
            Alert.alert("Geen team", "Geen team geladen.");
            return;
        }

        try {
            setSavingUserId(userId);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const isLinked = linkedTrainerIds.includes(userId);

            if (isLinked) {
                const { error } = await supabase
                    .from("team_trainers")
                    .delete()
                    .eq("team_id", team.id)
                    .eq("user_id", userId);

                if (error) throw error;

                setLinkedTrainerIds((current) => current.filter((id) => id !== userId));
            } else {
                const { error } = await supabase.from("team_trainers").insert({
                    team_id: team.id,
                    user_id: userId,
                });

                if (error) throw error;

                setLinkedTrainerIds((current) => [...current, userId]);
            }
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Koppeling opslaan mislukt."
            );
        } finally {
            setSavingUserId(null);
        }
    }

    async function changeRole(trainer: TrainerRow, nextRole: "head_trainer" | "trainer") {
        if (!team) return;
        if (trainer.id === user?.id) {
            Alert.alert("Niet toegestaan", "Je kunt je eigen rol hier niet wijzigen.");
            return;
        }

        try {
            setChangingRoleUserId(trainer.id);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const { error } = await supabase
                .from("profiles")
                .update({ role: nextRole })
                .eq("id", trainer.id);

            if (error) throw error;

            setTrainers((current) =>
                current.map((item) =>
                    item.id === trainer.id ? { ...item, role: nextRole } : item
                )
            );
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Rol wijzigen mislukt."
            );
        } finally {
            setChangingRoleUserId(null);
        }
    }

    const linkedTrainerList = useMemo(() => {
        return trainers.filter((trainer) => linkedTrainerIds.includes(trainer.id));
    }, [trainers, linkedTrainerIds]);

    const filteredTrainers = useMemo(() => {
        const query = searchText.trim().toLowerCase();

        if (!query) return trainers;

        return trainers.filter((trainer) => {
            const name = (trainer.full_name || "").toLowerCase();
            const email = (trainer.email || "").toLowerCase();
            return name.includes(query) || email.includes(query);
        });
    }, [trainers, searchText]);

    if (authLoading || loading) {
        return (
            <>
                <Stack.Screen
                    options={{
                        title: "Teamdetails",
                        headerBackTitle: "Teams",
                    }}
                />
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            </>
        );
    }

    if (!user) {
        return (
            <>
                <Stack.Screen
                    options={{
                        title: "Teamdetails",
                        headerBackTitle: "Teams",
                    }}
                />
                <View style={styles.center}>
                    <Text style={styles.title}>Teamdetails</Text>
                    <Text style={styles.text}>Log in om teamdetails te bekijken.</Text>
                </View>
            </>
        );
    }

    if (!canManageTeam) {
        return (
            <>
                <Stack.Screen
                    options={{
                        title: "Teamdetails",
                        headerBackTitle: "Teams",
                    }}
                />
                <View style={styles.center}>
                    <Text style={styles.title}>Geen toegang</Text>
                    <Text style={styles.text}>
                        Alleen hoofdtrainers en super admins kunnen teamdetails beheren.
                    </Text>
                </View>
            </>
        );
    }

    if (errorText) {
        return (
            <>
                <Stack.Screen
                    options={{
                        title: "Teamdetails",
                        headerBackTitle: "Teams",
                    }}
                />
                <View style={styles.center}>
                    <Text style={styles.title}>Teamdetails</Text>
                    <Text style={styles.text}>{errorText}</Text>
                </View>
            </>
        );
    }

    return (
        <>
            <Stack.Screen
                options={{
                    title: team?.name || "Teamdetails",
                    headerBackTitle: "Teams",
                }}
            />

            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                <View style={styles.card}>
                    <Pressable style={styles.backButton} onPress={() => router.back()}>
                        <Text style={styles.backButtonText}>← Terug naar teams</Text>
                    </Pressable>

                    <Text style={styles.title}>Teamdetails</Text>

                    <Text style={styles.label}>Teamnaam</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Teamnaam"
                        placeholderTextColor={COLORS.mutedText}
                        value={teamName}
                        onChangeText={setTeamName}
                    />

                    <Pressable
                        style={[styles.button, savingTeamName && styles.buttonDisabled]}
                        onPress={handleRenameTeam}
                        disabled={savingTeamName}
                    >
                        {savingTeamName ? (
                            <ActivityIndicator color={COLORS.text} />
                        ) : (
                            <Text style={styles.buttonText}>Teamnaam opslaan</Text>
                        )}
                    </Pressable>
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Overzicht</Text>

                    <View style={styles.summaryBlock}>
                        <Text style={styles.summaryLabel}>Team</Text>
                        <Text style={styles.summaryValue}>{team?.name || "-"}</Text>
                    </View>

                    <View style={styles.summaryBlock}>
                        <Text style={styles.summaryLabel}>Gekoppelde trainers</Text>
                        <Text style={styles.summaryValue}>{linkedTrainerList.length}</Text>
                    </View>

                    <View style={styles.summaryBlock}>
                        <Text style={styles.summaryLabel}>Komende trainingen</Text>
                        <Text style={styles.summaryValue}>{upcomingTrainings.length}</Text>
                    </View>

                    <Text style={styles.sectionSubtitle}>Nu gekoppeld</Text>
                    {linkedTrainerList.length === 0 ? (
                        <Text style={styles.emptyText}>Nog geen trainers gekoppeld.</Text>
                    ) : (
                        linkedTrainerList.map((trainer) => (
                            <View key={trainer.id} style={styles.linkedTrainerItem}>
                                <Text style={styles.trainerName}>
                                    {trainer.full_name || trainer.email || "Onbekende trainer"}
                                </Text>
                                <Text style={styles.trainerMeta}>
                                    {trainer.email || "-"} • {trainer.role || "-"}
                                </Text>
                            </View>
                        ))
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Komende trainingen</Text>

                    {upcomingTrainings.length === 0 ? (
                        <Text style={styles.emptyText}>Nog geen trainingen voor dit team.</Text>
                    ) : (
                        upcomingTrainings.map((training) => (
                            <View key={training.id} style={styles.trainingItem}>
                                <Text style={styles.trainingTitle}>{training.title}</Text>
                                <Text style={styles.trainingDate}>
                                    {formatDateForDisplay(training.training_date)}
                                </Text>
                            </View>
                        ))
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Trainers beheren</Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Zoek op naam of e-mail"
                        placeholderTextColor={COLORS.mutedText}
                        value={searchText}
                        onChangeText={setSearchText}
                    />

                    {filteredTrainers.length === 0 ? (
                        <Text style={styles.emptyText}>Geen trainers gevonden.</Text>
                    ) : (
                        filteredTrainers.map((trainer) => {
                            const isLinked = linkedTrainerIds.includes(trainer.id);
                            const isSavingLink = savingUserId === trainer.id;
                            const isChangingRole = changingRoleUserId === trainer.id;
                            const displayName = trainer.full_name || trainer.email || "Onbekende trainer";

                            return (
                                <View key={trainer.id} style={styles.trainerItem}>
                                    <View style={styles.trainerInfo}>
                                        <Text style={styles.trainerName}>{displayName}</Text>
                                        <Text style={styles.trainerMeta}>
                                            {trainer.email || "-"} • {trainer.role || "-"}
                                        </Text>
                                    </View>

                                    <View style={styles.actionColumn}>
                                        <Pressable
                                            style={[styles.smallButton, isSavingLink && styles.buttonDisabled]}
                                            onPress={() => toggleTrainer(trainer.id)}
                                            disabled={isSavingLink}
                                        >
                                            {isSavingLink ? (
                                                <ActivityIndicator color={COLORS.text} />
                                            ) : (
                                                <Text style={styles.smallButtonText}>
                                                    {isLinked ? "Ontkoppelen" : "Koppelen"}
                                                </Text>
                                            )}
                                        </Pressable>

                                        {trainer.role === "trainer" ? (
                                            <Pressable
                                                style={[styles.secondaryButton, isChangingRole && styles.buttonDisabled]}
                                                onPress={() => changeRole(trainer, "head_trainer")}
                                                disabled={isChangingRole}
                                            >
                                                <Text style={styles.secondaryButtonText}>Maak hoofdtrainer</Text>
                                            </Pressable>
                                        ) : trainer.role === "head_trainer" ? (
                                            <Pressable
                                                style={[styles.secondaryButton, isChangingRole && styles.buttonDisabled]}
                                                onPress={() => changeRole(trainer, "trainer")}
                                                disabled={isChangingRole}
                                            >
                                                <Text style={styles.secondaryButtonText}>Maak trainer</Text>
                                            </Pressable>
                                        ) : null}
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>
            </ScrollView>
        </>
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
        marginBottom: SPACING.lg,
    },
    backButton: {
        marginBottom: SPACING.md,
    },
    backButtonText: {
        color: COLORS.accent,
        fontSize: 15,
        fontWeight: "700",
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
    sectionSubtitle: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "800",
        marginTop: SPACING.sm,
        marginBottom: SPACING.md,
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
    button: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        alignItems: "center",
    },
    smallButton: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
        alignItems: "center",
        minWidth: 120,
    },
    secondaryButton: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
        alignItems: "center",
        minWidth: 120,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 16,
    },
    smallButtonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 14,
    },
    secondaryButtonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 13,
        textAlign: "center",
    },
    summaryBlock: {
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.md,
    },
    summaryLabel: {
        color: COLORS.primaryLight,
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 6,
    },
    summaryValue: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "800",
    },
    linkedTrainerItem: {
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.sm,
    },
    trainerItem: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.md,
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
    },
    trainerInfo: {
        flex: 1,
    },
    trainerName: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "800",
        marginBottom: 4,
    },
    trainerMeta: {
        color: COLORS.mutedText,
        fontSize: 14,
        fontWeight: "700",
    },
    actionColumn: {
        justifyContent: "center",
        gap: 10,
    },
    trainingItem: {
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.sm,
    },
    trainingTitle: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "800",
        marginBottom: 4,
    },
    trainingDate: {
        color: COLORS.mutedText,
        fontSize: 14,
        fontWeight: "700",
    },
    emptyText: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
    },
});