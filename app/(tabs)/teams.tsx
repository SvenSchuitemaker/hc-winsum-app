import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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

type ProfileRow = {
    id: string;
    club_id: number | null;
    role: "super_admin" | "head_trainer" | "trainer" | null;
};

type TeamRow = {
    id: number;
    name: string;
    club_id: number;
};

type TeamStatsRow = {
    team_id: number;
    trainers_count: number;
    trainings_count: number;
};

export default function TeamsScreen() {
    const { user, role, loading: authLoading } = useAuth();
    const canManageTeams = role === "head_trainer" || role === "super_admin";

    const [profile, setProfile] = useState<ProfileRow | null>(null);
    const [teams, setTeams] = useState<TeamRow[]>([]);
    const [teamStats, setTeamStats] = useState<Record<number, TeamStatsRow>>({});
    const [teamName, setTeamName] = useState("");
    const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
    const [editingTeamName, setEditingTeamName] = useState("");
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [savingRenameId, setSavingRenameId] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [errorText, setErrorText] = useState("");

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [user, role])
    );

    async function loadData() {
        try {
            setLoading(true);
            setErrorText("");

            if (!supabase) {
                setErrorText("Supabase is niet geladen.");
                return;
            }

            if (!user) {
                setProfile(null);
                setTeams([]);
                setTeamStats({});
                return;
            }

            const { data: profileData, error: profileError } = await supabase
                .from("profiles")
                .select("id, club_id, role")
                .eq("id", user.id)
                .single();

            if (profileError) throw profileError;

            const loadedProfile = profileData as ProfileRow;
            setProfile(loadedProfile);

            if (!loadedProfile.club_id) {
                setTeams([]);
                setTeamStats({});
                return;
            }

            const { data: teamsData, error: teamsError } = await supabase
                .from("teams")
                .select("id, name, club_id")
                .eq("club_id", loadedProfile.club_id)
                .order("name", { ascending: true });

            if (teamsError) throw teamsError;

            const loadedTeams = (teamsData as TeamRow[]) || [];
            setTeams(loadedTeams);

            if (loadedTeams.length === 0) {
                setTeamStats({});
                return;
            }

            const teamIds = loadedTeams.map((team) => team.id);

            const [{ data: teamTrainersData, error: teamTrainersError }, { data: trainingsData, error: trainingsError }] =
                await Promise.all([
                    supabase.from("team_trainers").select("team_id").in("team_id", teamIds),
                    supabase.from("trainings").select("team_id").in("team_id", teamIds),
                ]);

            if (teamTrainersError) throw teamTrainersError;
            if (trainingsError) throw trainingsError;

            const stats: Record<number, TeamStatsRow> = {};

            loadedTeams.forEach((team) => {
                stats[team.id] = {
                    team_id: team.id,
                    trainers_count: 0,
                    trainings_count: 0,
                };
            });

            ((teamTrainersData as { team_id: number }[]) || []).forEach((row) => {
                if (stats[row.team_id]) {
                    stats[row.team_id].trainers_count += 1;
                }
            });

            ((trainingsData as { team_id: number | null }[]) || []).forEach((row) => {
                if (row.team_id && stats[row.team_id]) {
                    stats[row.team_id].trainings_count += 1;
                }
            });

            setTeamStats(stats);
        } catch (error) {
            setErrorText(
                error instanceof Error ? error.message : "Teams laden mislukt."
            );
            setTeams([]);
            setTeamStats({});
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateTeam() {
        if (!canManageTeams) {
            Alert.alert("Geen toegang", "Alleen hoofdtrainers en super admins mogen teams beheren.");
            return;
        }

        if (!profile?.club_id) {
            Alert.alert("Geen club", "Er is geen club gekoppeld aan dit account.");
            return;
        }

        if (!teamName.trim()) {
            Alert.alert("Ontbrekende naam", "Vul een teamnaam in.");
            return;
        }

        try {
            setCreating(true);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const { error } = await supabase.from("teams").insert({
                club_id: profile.club_id,
                name: teamName.trim(),
            });

            if (error) throw error;

            setTeamName("");
            await loadData();
            Alert.alert("Gelukt", "Team aangemaakt.");
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Team aanmaken mislukt."
            );
        } finally {
            setCreating(false);
        }
    }

    function startRename(team: TeamRow) {
        setEditingTeamId(team.id);
        setEditingTeamName(team.name);
    }

    async function saveRename(teamId: number) {
        if (!editingTeamName.trim()) {
            Alert.alert("Ontbrekende naam", "Vul een teamnaam in.");
            return;
        }

        try {
            setSavingRenameId(teamId);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const { error } = await supabase
                .from("teams")
                .update({ name: editingTeamName.trim() })
                .eq("id", teamId);

            if (error) throw error;

            setTeams((current) =>
                current.map((team) =>
                    team.id === teamId ? { ...team, name: editingTeamName.trim() } : team
                )
            );

            setEditingTeamId(null);
            setEditingTeamName("");
            Alert.alert("Gelukt", "Team hernoemd.");
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Hernoemen mislukt."
            );
        } finally {
            setSavingRenameId(null);
        }
    }

    function cancelRename() {
        setEditingTeamId(null);
        setEditingTeamName("");
    }

    function confirmDelete(team: TeamRow) {
        const stats = teamStats[team.id];
        const trainersCount = stats?.trainers_count || 0;
        const trainingsCount = stats?.trainings_count || 0;

        Alert.alert(
            "Team verwijderen",
            `${team.name}\n\nGekoppelde trainers: ${trainersCount}\nGekoppelde trainingen: ${trainingsCount}\n\nWeet je zeker dat je dit team wilt verwijderen?`,
            [
                { text: "Annuleren", style: "cancel" },
                {
                    text: "Verwijderen",
                    style: "destructive",
                    onPress: () => handleDelete(team.id),
                },
            ]
        );
    }

    async function handleDelete(teamId: number) {
        try {
            setDeletingId(teamId);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const stats = teamStats[teamId];
            if ((stats?.trainers_count || 0) > 0 || (stats?.trainings_count || 0) > 0) {
                Alert.alert(
                    "Let op",
                    "Dit team heeft nog gekoppelde trainers of trainingen. Verwijderen kan, maar controleer eerst of dit echt de bedoeling is."
                );
            }

            const { error } = await supabase.from("teams").delete().eq("id", teamId);
            if (error) throw error;

            setTeams((current) => current.filter((team) => team.id !== teamId));
            setTeamStats((current) => {
                const copy = { ...current };
                delete copy[teamId];
                return copy;
            });
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Verwijderen mislukt."
            );
        } finally {
            setDeletingId(null);
        }
    }

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
                <Text style={styles.title}>Teams</Text>
                <Text style={styles.text}>Log in om teams te beheren.</Text>
            </View>
        );
    }

    if (!canManageTeams) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Geen toegang</Text>
                <Text style={styles.text}>
                    Alleen hoofdtrainers en super admins kunnen teams beheren.
                </Text>
            </View>
        );
    }

    if (errorText) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Teams</Text>
                <Text style={styles.text}>{errorText}</Text>
                <Pressable style={styles.button} onPress={loadData}>
                    <Text style={styles.buttonText}>Opnieuw laden</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                <Text style={styles.title}>Teams beheren</Text>
                <Text style={styles.text}>
                    Maak teams aan, hernoem ze en tik op een team voor trainers en trainingen.
                </Text>

                <Text style={styles.label}>Nieuwe teamnaam</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Bijv. JO12-1"
                    placeholderTextColor={COLORS.mutedText}
                    value={teamName}
                    onChangeText={setTeamName}
                />

                <Pressable
                    style={[styles.button, creating && styles.buttonDisabled]}
                    onPress={handleCreateTeam}
                    disabled={creating}
                >
                    {creating ? (
                        <ActivityIndicator color={COLORS.text} />
                    ) : (
                        <Text style={styles.buttonText}>Team aanmaken</Text>
                    )}
                </Pressable>
            </View>

            <View style={styles.listCard}>
                <Text style={styles.sectionTitle}>Bestaande teams</Text>

                {teams.length === 0 ? (
                    <Text style={styles.emptyText}>Er zijn nog geen teams aangemaakt.</Text>
                ) : (
                    teams.map((team) => {
                        const stats = teamStats[team.id];

                        return (
                            <View key={team.id} style={styles.teamItem}>
                                {editingTeamId === team.id ? (
                                    <View style={styles.editWrap}>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Teamnaam"
                                            placeholderTextColor={COLORS.mutedText}
                                            value={editingTeamName}
                                            onChangeText={setEditingTeamName}
                                        />
                                        <View style={styles.editActions}>
                                            <Pressable
                                                style={[styles.smallButton, styles.cancelButton]}
                                                onPress={cancelRename}
                                            >
                                                <Text style={styles.smallButtonText}>Annuleren</Text>
                                            </Pressable>
                                            <Pressable
                                                style={[styles.smallButton, savingRenameId === team.id && styles.buttonDisabled]}
                                                onPress={() => saveRename(team.id)}
                                                disabled={savingRenameId === team.id}
                                            >
                                                {savingRenameId === team.id ? (
                                                    <ActivityIndicator color={COLORS.text} />
                                                ) : (
                                                    <Text style={styles.smallButtonText}>Opslaan</Text>
                                                )}
                                            </Pressable>
                                        </View>
                                    </View>
                                ) : (
                                    <>
                                        <Pressable
                                            style={styles.teamMain}
                                            onPress={() => router.push(`/team-details/${team.id}`)}
                                        >
                                            <Text style={styles.teamName}>{team.name}</Text>
                                            <Text style={styles.teamMeta}>
                                                Trainers: {stats?.trainers_count || 0} • Trainingen: {stats?.trainings_count || 0}
                                            </Text>
                                            <Text style={styles.teamHint}>Tik om te beheren</Text>
                                        </Pressable>

                                        <View style={styles.teamActions}>
                                            <Pressable
                                                style={styles.iconButton}
                                                onPress={() => startRename(team)}
                                            >
                                                <Ionicons name="create-outline" size={20} color={COLORS.text} />
                                            </Pressable>

                                            <Pressable
                                                style={[
                                                    styles.deleteIconButton,
                                                    deletingId === team.id && styles.buttonDisabled,
                                                ]}
                                                onPress={() => confirmDelete(team)}
                                                disabled={deletingId === team.id}
                                            >
                                                {deletingId === team.id ? (
                                                    <ActivityIndicator size="small" color="#C0392B" />
                                                ) : (
                                                    <Ionicons name="trash-outline" size={20} color="#C0392B" />
                                                )}
                                            </Pressable>
                                        </View>
                                    </>
                                )}
                            </View>
                        );
                    })
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
        paddingVertical: 12,
        paddingHorizontal: 14,
        alignItems: "center",
        minWidth: 110,
    },
    cancelButton: {
        opacity: 0.75,
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
    emptyText: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
    },
    teamItem: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.md,
        flexDirection: "row",
        gap: 12,
    },
    teamMain: {
        flex: 1,
    },
    teamName: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "800",
        marginBottom: 4,
    },
    teamMeta: {
        color: COLORS.mutedText,
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 4,
    },
    teamHint: {
        color: COLORS.accent,
        fontSize: 14,
        fontWeight: "700",
    },
    teamActions: {
        justifyContent: "center",
        gap: 10,
    },
    iconButton: {
        width: 42,
        height: 42,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.surface,
    },
    deleteIconButton: {
        width: 42,
        height: 42,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#C0392B",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.surface,
    },
    editWrap: {
        flex: 1,
    },
    editActions: {
        flexDirection: "row",
        gap: 10,
    },
});