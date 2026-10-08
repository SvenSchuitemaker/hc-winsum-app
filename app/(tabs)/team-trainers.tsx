import { Picker } from "@react-native-picker/picker";
import { useFocusEffect } from "expo-router";
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

type TrainerRow = {
    id: string;
    email: string | null;
    role: "super_admin" | "head_trainer" | "trainer" | null;
    full_name: string | null;
    phone: string | null;
    specialty: string | null;
    age_groups: string[] | null;
};

type TeamTrainerRow = {
    user_id: string;
};

export default function TeamTrainersScreen() {
    const { user, role, loading: authLoading } = useAuth();
    const canManageTeamTrainers = role === "head_trainer" || role === "super_admin";

    const [profile, setProfile] = useState<ProfileRow | null>(null);
    const [teams, setTeams] = useState<TeamRow[]>([]);
    const [trainers, setTrainers] = useState<TrainerRow[]>([]);
    const [linkedTrainerIds, setLinkedTrainerIds] = useState<string[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState("");
    const [loading, setLoading] = useState(true);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
    const [errorText, setErrorText] = useState("");

    useFocusEffect(
        useCallback(() => {
            loadBaseData();
        }, [user, role])
    );

    useFocusEffect(
        useCallback(() => {
            if (selectedTeamId) {
                loadLinkedTrainers(selectedTeamId);
            }
        }, [selectedTeamId])
    );

    async function loadBaseData() {
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
                setTrainers([]);
                setLinkedTrainerIds([]);
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
                setTrainers([]);
                setLinkedTrainerIds([]);
                return;
            }

            const [{ data: teamsData, error: teamsError }, { data: trainersData, error: trainersError }] =
                await Promise.all([
                    supabase
                        .from("teams")
                        .select("id, name, club_id")
                        .eq("club_id", loadedProfile.club_id)
                        .order("name", { ascending: true }),
                    supabase
                        .from("profiles")
                        .select("id, email, role, full_name, phone, specialty, age_groups")
                        .eq("club_id", loadedProfile.club_id)
                        .eq("role", "trainer")
                        .order("full_name", { ascending: true, nullsFirst: false })
                        .order("email", { ascending: true }),
                ]);

            if (teamsError) throw teamsError;
            if (trainersError) throw trainersError;

            const loadedTeams = (teamsData as TeamRow[]) || [];
            const loadedTrainers = (trainersData as TrainerRow[]) || [];

            setTeams(loadedTeams);
            setTrainers(loadedTrainers);

            if (loadedTeams.length > 0) {
                const firstTeamId = String(loadedTeams[0].id);
                setSelectedTeamId((current) => current || firstTeamId);
                await loadLinkedTrainers(currentOrFirst(currentValue(selectedTeamId), firstTeamId));
            } else {
                setSelectedTeamId("");
                setLinkedTrainerIds([]);
            }
        } catch (error) {
            setErrorText(
                error instanceof Error ? error.message : "Gegevens laden mislukt."
            );
            setTeams([]);
            setTrainers([]);
            setLinkedTrainerIds([]);
        } finally {
            setLoading(false);
        }
    }

    function currentOrFirst(current: string, fallback: string) {
        return current || fallback;
    }

    function currentValue(value: string) {
        return value;
    }

    async function loadLinkedTrainers(teamId: string) {
        try {
            if (!supabase || !teamId) {
                setLinkedTrainerIds([]);
                return;
            }

            const { data, error } = await supabase
                .from("team_trainers")
                .select("user_id")
                .eq("team_id", Number(teamId));

            if (error) throw error;

            const ids = ((data as TeamTrainerRow[]) || []).map((row) => row.user_id);
            setLinkedTrainerIds(ids);
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error
                    ? error.message
                    : "Gekoppelde trainers laden mislukt."
            );
            setLinkedTrainerIds([]);
        }
    }

    const selectedTeamName = useMemo(() => {
        return teams.find((team) => String(team.id) === selectedTeamId)?.name || "";
    }, [teams, selectedTeamId]);

    async function toggleTrainer(userId: string) {
        if (!selectedTeamId) {
            Alert.alert("Geen team", "Kies eerst een team.");
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
                    .eq("team_id", Number(selectedTeamId))
                    .eq("user_id", userId);

                if (error) throw error;

                setLinkedTrainerIds((current) => current.filter((id) => id !== userId));
            } else {
                const { error } = await supabase.from("team_trainers").insert({
                    team_id: Number(selectedTeamId),
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
                <Text style={styles.text}>Log in om trainers aan teams te koppelen.</Text>
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
                <Pressable style={styles.button} onPress={loadBaseData}>
                    <Text style={styles.buttonText}>Opnieuw laden</Text>
                </Pressable>
            </View>
        );
    }

    if (teams.length === 0) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Nog geen teams</Text>
                <Text style={styles.text}>
                    Maak eerst minstens één team aan voordat je trainers kunt koppelen.
                </Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                <Text style={styles.title}>Trainers koppelen</Text>
                <Text style={styles.text}>
                    Kies een team en bepaal welke trainers daar toegang toe hebben.
                </Text>

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

                {!!selectedTeamName && (
                    <Text style={styles.currentTeamText}>Geselecteerd team: {selectedTeamName}</Text>
                )}
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
                                        {trainer.full_name || trainer.email || "Naam niet ingevuld"}
                                    </Text>
                                    <Text style={styles.trainerRole}>
                                        {trainer.specialty || "Geen specialisme ingevuld"}
                                    </Text>
                                    {!!trainer.phone && <Text style={styles.trainerMeta}>{trainer.phone}</Text>}
                                    {(trainer.age_groups || []).length > 0 && (
                                        <Text style={styles.trainerMeta}>{(trainer.age_groups || []).join(", ")}</Text>
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
    currentTeamText: {
        color: COLORS.text,
        fontSize: 15,
        fontWeight: "700",
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
        fontSize: 16,
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
        marginTop: 3,
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
    button: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        paddingHorizontal: 18,
        alignItems: "center",
        alignSelf: "center",
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 16,
    },
});