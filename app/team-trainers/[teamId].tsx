import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
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

type TeamRow = {
    id: number;
    name: string;
    club_id: number;
};

type TrainerRow = {
    id: string;
    email: string | null;
    role: "super_admin" | "head_trainer" | "trainer" | null;
    club_id: number | null;
    full_name: string | null;
    phone: string | null;
    specialty: string | null;
    age_groups: string[] | null;
    bio: string | null;
};

type TeamTrainerRow = {
    user_id: string;
};

export default function TeamTrainersScreen() {
    const { user, role, loading: authLoading } = useAuth();
    const { teamId } = useLocalSearchParams<{ teamId: string }>();
    const canManageTeamTrainers = role === "head_trainer" || role === "super_admin";

    const [team, setTeam] = useState<TeamRow | null>(null);
    const [trainers, setTrainers] = useState<TrainerRow[]>([]);
    const [linkedTrainerIds, setLinkedTrainerIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
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

            const [
                { data: trainersData, error: trainersError },
                { data: linkedData, error: linkedError },
            ] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("id, email, role, club_id, full_name, phone, specialty, age_groups, bio")
                    .eq("club_id", loadedTeam.club_id)
                    .eq("role", "trainer")
                    .order("email", { ascending: true }),
                supabase
                    .from("team_trainers")
                    .select("user_id")
                    .eq("team_id", numericTeamId),
            ]);

            if (trainersError) throw trainersError;
            if (linkedError) throw linkedError;

            setTrainers((trainersData as TrainerRow[]) || []);
            setLinkedTrainerIds(
                ((linkedData as TeamTrainerRow[]) || []).map((row) => row.user_id)
            );
        } catch (error) {
            setErrorText(
                error instanceof Error ? error.message : "Gegevens laden mislukt."
            );
            setTeam(null);
            setTrainers([]);
            setLinkedTrainerIds([]);
        } finally {
            setLoading(false);
        }
    }

    async function toggleTrainer(userId: string) {
        if (!teamId) {
            Alert.alert("Geen team", "Geen team geselecteerd.");
            return;
        }

        try {
            setSavingUserId(userId);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const numericTeamId = Number(teamId);
            const isLinked = linkedTrainerIds.includes(userId);

            if (isLinked) {
                const { error } = await supabase
                    .from("team_trainers")
                    .delete()
                    .eq("team_id", numericTeamId)
                    .eq("user_id", userId);

                if (error) throw error;

                setLinkedTrainerIds((current) => current.filter((id) => id !== userId));
            } else {
                const { error } = await supabase.from("team_trainers").insert({
                    team_id: numericTeamId,
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

    const linkedCount = useMemo(() => linkedTrainerIds.length, [linkedTrainerIds]);

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
                <Text style={styles.title}>Team trainers</Text>
                <Text style={styles.text}>Log in om trainers te koppelen.</Text>
            </View>
        );
    }

    if (!canManageTeamTrainers) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Geen toegang</Text>
                <Text style={styles.text}>
                    Alleen hoofdtrainers en super admins kunnen trainers koppelen.
                </Text>
            </View>
        );
    }

    if (errorText) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Team trainers</Text>
                <Text style={styles.text}>{errorText}</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                <Pressable style={styles.backButton} onPress={() => router.back()}>
                    <Text style={styles.backButtonText}>← Terug naar teams</Text>
                </Pressable>

                <Text style={styles.title}>Team trainers</Text>
                <Text style={styles.text}>
                    Beheer welke trainers gekoppeld zijn aan dit team.
                </Text>

                <View style={styles.summaryBlock}>
                    <Text style={styles.summaryLabel}>Team</Text>
                    <Text style={styles.summaryValue}>{team?.name || "-"}</Text>
                </View>

                <View style={styles.summaryBlock}>
                    <Text style={styles.summaryLabel}>Aantal gekoppeld</Text>
                    <Text style={styles.summaryValue}>{linkedCount}</Text>
                </View>
            </View>

            <View style={styles.listCard}>
                <Text style={styles.sectionTitle}>Beschikbare trainers</Text>

                {trainers.length === 0 ? (
                    <Text style={styles.emptyText}>Er zijn nog geen trainers in deze club.</Text>
                ) : (
                    trainers.map((trainer) => {
                        const isLinked = linkedTrainerIds.includes(trainer.id);
                        const isSaving = savingUserId === trainer.id;

                        return (
                            <View key={trainer.id} style={styles.trainerItem}>
                                <View style={styles.trainerInfo}>
                                    <Text style={styles.trainerName}>
                                        {trainer.full_name?.trim() || trainer.email || "Onbekende trainer"}
                                    </Text>
                                    {!!trainer.full_name && (
                                        <Text style={styles.trainerEmail}>{trainer.email || "Zonder e-mail"}</Text>
                                    )}
                                    <Text style={styles.trainerRole}>
                                        {trainer.specialty || "Geen specialisme ingevuld"}
                                    </Text>
                                    {!!trainer.phone && (
                                        <Text style={styles.trainerMeta}>{trainer.phone}</Text>
                                    )}
                                    {(trainer.age_groups || []).length > 0 && (
                                        <Text style={styles.trainerMeta}>
                                            Leeftijd: {(trainer.age_groups || []).join(", ")}
                                        </Text>
                                    )}
                                    {!!trainer.bio && (
                                        <Text style={styles.trainerBio} numberOfLines={3}>
                                            {trainer.bio}
                                        </Text>
                                    )}
                                </View>

                                <Pressable
                                    style={[
                                        styles.linkButton,
                                        isLinked && styles.unlinkButton,
                                        isSaving && styles.buttonDisabled,
                                    ]}
                                    onPress={() => toggleTrainer(trainer.id)}
                                    disabled={isSaving}
                                >
                                    {isSaving ? (
                                        <ActivityIndicator color={COLORS.text} />
                                    ) : (
                                        <Text style={styles.linkButtonText}>
                                            {isLinked ? "Ontkoppelen" : "Koppelen"}
                                        </Text>
                                    )}
                                </Pressable>
                            </View>
                        );
                    })
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    content: {
        padding: SPACING.md,
        paddingBottom: SPACING.xxl,
    },
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
    listCard: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
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
    text: {
        color: COLORS.mutedText,
        fontSize: 16,
        lineHeight: 24,
        textAlign: "center",
        marginBottom: SPACING.md,
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
    emptyText: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
    },
    trainerItem: {
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
    trainerInfo: {
        flex: 1,
    },
    trainerName: {
        color: COLORS.text,
        fontSize: 17,
        fontWeight: "900",
        marginBottom: 3,
    },
    trainerEmail: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "800",
        marginBottom: 4,
    },
    trainerRole: {
        color: COLORS.primaryLight,
        fontSize: 14,
        fontWeight: "700",
        marginTop: 3,
    },
    trainerMeta: {
        color: COLORS.mutedText,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 3,
    },
    trainerBio: {
        color: COLORS.mutedText,
        fontSize: 13,
        lineHeight: 19,
        marginTop: 7,
    },
    linkButton: {
        minWidth: 120,
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 12,
        paddingHorizontal: 14,
        alignItems: "center",
    },
    unlinkButton: {
        opacity: 0.85,
    },
    linkButtonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 14,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
});