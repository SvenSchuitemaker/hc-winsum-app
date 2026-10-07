import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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
};

type ProfileRow = {
    id: string;
    email: string | null;
    role: string;
    club_id: number | null;
    clubs: {
        id: number;
        name: string;
        club_code: string;
    } | null;
};

export default function ProfileScreen() {
    const { user, role } = useAuth();
    const [profile, setProfile] = useState<ProfileRow | null>(null);
    const [teams, setTeams] = useState<TeamRow[]>([]);
    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            loadProfile();
        }, [user])
    );

    async function loadProfile() {
        try {
            setLoading(true);

            if (!supabase || !user) {
                setProfile(null);
                setTeams([]);
                return;
            }

            const [
                { data: profileData, error: profileError },
                { data: teamsData, error: teamsError },
            ] = await Promise.all([
                supabase
                    .from("profiles")
                    .select(`
            id,
            email,
            role,
            club_id,
            clubs (
              id,
              name,
              club_code
            )
          `)
                    .eq("id", user.id)
                    .single(),
                supabase
                    .from("team_trainers")
                    .select(`
            teams (
              id,
              name
            )
          `)
                    .eq("user_id", user.id),
            ]);

            if (profileError) {
                throw profileError;
            }

            if (teamsError) {
                throw teamsError;
            }

            const rawProfile = profileData as any;

            setProfile({
                id: rawProfile.id,
                email: rawProfile.email,
                role: rawProfile.role,
                club_id: rawProfile.club_id,
                clubs: Array.isArray(rawProfile.clubs)
                    ? rawProfile.clubs[0] ?? null
                    : rawProfile.clubs ?? null,
            });

            const mappedTeams: TeamRow[] = (teamsData ?? [])
                .map((item: any): TeamRow | null => {
                    const team = Array.isArray(item.teams) ? item.teams[0] : item.teams;

                    if (!team) return null;

                    return {
                        id: team.id,
                        name: team.name,
                    };
                })
                .filter((team): team is TeamRow => team !== null);

            setTeams(mappedTeams);
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Profiel laden mislukt."
            );
        } finally {
            setLoading(false);
        }
    }

    async function handleLogout() {
        try {
            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const { error } = await supabase.auth.signOut();

            if (error) {
                throw error;
            }
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Uitloggen mislukt."
            );
        }
    }

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (!user) {
        return (
            <View style={styles.center}>
                <View style={styles.guestCard}>
                    <Text style={styles.title}>Profiel</Text>
                    <Text style={styles.text}>Log in om je profiel te bekijken.</Text>

                    <Pressable
                        style={styles.loginButton}
                        onPress={() => router.push("/login")}
                    >
                        <Text style={styles.loginButtonText}>Inloggen</Text>
                    </Pressable>

                    <Pressable
                        style={styles.registerButton}
                        onPress={() => router.push("/register")}
                    >
                        <Text style={styles.registerButtonText}>Account aanmaken</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                <Text style={styles.title}>Profiel</Text>

                <View style={styles.infoBlock}>
                    <Text style={styles.label}>E-mail</Text>
                    <Text style={styles.value}>{profile?.email || user.email || "-"}</Text>
                </View>

                <View style={styles.infoBlock}>
                    <Text style={styles.label}>Rol</Text>
                    <Text style={styles.value}>{role || profile?.role || "-"}</Text>
                </View>

                <View style={styles.infoBlock}>
                    <Text style={styles.label}>Club</Text>
                    <Text style={styles.value}>
                        {profile?.clubs?.name || "Geen club gekoppeld"}
                    </Text>
                </View>

                <View style={styles.infoBlock}>
                    <Text style={styles.label}>Clubcode</Text>
                    <Text style={styles.value}>{profile?.clubs?.club_code || "-"}</Text>
                </View>

                <View style={styles.infoBlock}>
                    <Text style={styles.label}>Mijn teams</Text>
                    {teams.length === 0 ? (
                        <Text style={styles.value}>Nog geen teams gekoppeld</Text>
                    ) : (
                        teams.map((team) => (
                            <Text key={team.id} style={styles.teamText}>
                                • {team.name}
                            </Text>
                        ))
                    )}
                </View>

                <Pressable style={styles.logoutButton} onPress={handleLogout}>
                    <Text style={styles.logoutButtonText}>Uitloggen</Text>
                </Pressable>
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
    guestCard: {
        width: "100%",
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
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
        marginBottom: SPACING.lg,
    },
    text: {
        color: COLORS.mutedText,
        fontSize: 16,
        lineHeight: 24,
        textAlign: "center",
        marginBottom: SPACING.lg,
    },
    infoBlock: {
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.md,
    },
    label: {
        color: COLORS.primaryLight,
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 6,
    },
    value: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "700",
    },
    teamText: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "700",
        marginTop: 4,
    },
    loginButton: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        alignItems: "center",
        marginBottom: SPACING.sm,
    },
    loginButtonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 16,
    },
    registerButton: {
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    registerButtonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 16,
    },
    logoutButton: {
        marginTop: SPACING.sm,
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        alignItems: "center",
    },
    logoutButtonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 16,
    },
});