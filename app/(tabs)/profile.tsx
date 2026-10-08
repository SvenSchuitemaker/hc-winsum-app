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

type TeamRow = {
    id: number;
    name: string;
};

type ProfileRow = {
    id: string;
    email: string | null;
    role: string;
    club_id: number | null;
    full_name: string | null;
    phone: string | null;
    specialty: string | null;
    age_groups: string[] | null;
    bio: string | null;
    clubs: {
        id: number;
        name: string;
        club_code: string;
    } | null;
};

const AGE_GROUP_OPTIONS = ["JO8", "JO10", "JO12", "JO14", "JO16", "JO18", "MO8", "MO10", "MO12", "MO14", "MO16", "MO18", "Senioren"];

export default function ProfileScreen() {
    const { user, role } = useAuth();
    const canViewDashboard = role === "head_trainer" || role === "super_admin";
    const [profile, setProfile] = useState<ProfileRow | null>(null);
    const [teams, setTeams] = useState<TeamRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [fullName, setFullName] = useState("");
    const [phone, setPhone] = useState("");
    const [specialty, setSpecialty] = useState("");
    const [ageGroups, setAgeGroups] = useState<string[]>([]);
    const [bio, setBio] = useState("");

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
            full_name,
            phone,
            specialty,
            age_groups,
            bio,
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
                full_name: rawProfile.full_name,
                phone: rawProfile.phone,
                specialty: rawProfile.specialty,
                age_groups: rawProfile.age_groups,
                bio: rawProfile.bio,
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
            setFullName(rawProfile.full_name || "");
            setPhone(rawProfile.phone || "");
            setSpecialty(rawProfile.specialty || "");
            setAgeGroups(rawProfile.age_groups || []);
            setBio(rawProfile.bio || "");
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Profiel laden mislukt."
            );
        } finally {
            setLoading(false);
        }
    }

    function toggleAgeGroup(ageGroup: string) {
        setAgeGroups((current) =>
            current.includes(ageGroup)
                ? current.filter((item) => item !== ageGroup)
                : [...current, ageGroup]
        );
    }

    async function handleSaveProfile() {
        try {
            setSavingProfile(true);

            if (!supabase || !user) {
                throw new Error("Je bent niet ingelogd.");
            }

            const { error } = await supabase
                .from("profiles")
                .update({
                    full_name: fullName.trim() || null,
                    phone: phone.trim() || null,
                    specialty: specialty.trim() || null,
                    age_groups: ageGroups,
                    bio: bio.trim() || null,
                })
                .eq("id", user.id);

            if (error) throw error;

            Alert.alert("Gelukt", "Je trainerprofiel is opgeslagen.");
            await loadProfile();
        } catch (error) {
            Alert.alert(
                "Fout",
                error instanceof Error ? error.message : "Profiel opslaan mislukt."
            );
        } finally {
            setSavingProfile(false);
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

                {canViewDashboard && (
                    <Pressable
                        style={styles.dashboardButton}
                        onPress={() => router.push("/dashboard")}
                    >
                        <View style={styles.dashboardButtonIcon}>
                            <Ionicons name="stats-chart-outline" size={24} color={COLORS.text} />
                        </View>
                        <View style={styles.dashboardButtonTextWrap}>
                            <Text style={styles.dashboardButtonTitle}>Hoofdtrainer dashboard</Text>
                            <Text style={styles.dashboardButtonText}>
                                Bekijk trainers, teams, trainingen en oefenstatistieken.
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward-outline" size={22} color={COLORS.primaryLight} />
                    </Pressable>
                )}

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

                <View style={styles.profileEditor}>
                    <Text style={styles.profileEditorTitle}>Trainerprofiel</Text>
                    <Text style={styles.profileEditorText}>
                        Vul je gegevens aan zodat hoofdtrainers en teamgenoten snel zien wie je bent en waar je sterk in bent.
                    </Text>

                    <Text style={styles.label}>Naam</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Voor- en achternaam"
                        placeholderTextColor={COLORS.mutedText}
                        value={fullName}
                        onChangeText={setFullName}
                    />

                    <Text style={styles.label}>Telefoonnummer</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="06 12345678"
                        placeholderTextColor={COLORS.mutedText}
                        keyboardType="phone-pad"
                        value={phone}
                        onChangeText={setPhone}
                    />

                    <Text style={styles.label}>Specialisme</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Bijv. techniek, verdedigen of keepers"
                        placeholderTextColor={COLORS.mutedText}
                        value={specialty}
                        onChangeText={setSpecialty}
                    />

                    <Text style={styles.label}>Leeftijdsgroepen</Text>
                    <View style={styles.ageGroupWrap}>
                        {AGE_GROUP_OPTIONS.map((ageGroup) => {
                            const selected = ageGroups.includes(ageGroup);
                            return (
                                <Pressable
                                    key={ageGroup}
                                    style={[styles.ageGroupChip, selected && styles.ageGroupChipSelected]}
                                    onPress={() => toggleAgeGroup(ageGroup)}
                                >
                                    <Text style={[styles.ageGroupChipText, selected && styles.ageGroupChipTextSelected]}>
                                        {ageGroup}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.label}>Over mij</Text>
                    <TextInput
                        style={[styles.input, styles.textarea]}
                        placeholder="Vertel kort iets over jezelf als trainer..."
                        placeholderTextColor={COLORS.mutedText}
                        multiline
                        value={bio}
                        onChangeText={setBio}
                    />

                    <Pressable
                        style={[styles.saveProfileButton, savingProfile && styles.buttonDisabled]}
                        onPress={handleSaveProfile}
                        disabled={savingProfile}
                    >
                        {savingProfile ? (
                            <ActivityIndicator color={COLORS.text} />
                        ) : (
                            <Text style={styles.saveProfileButtonText}>Trainerprofiel opslaan</Text>
                        )}
                    </Pressable>
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
    dashboardButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.md,
    },
    dashboardButtonIcon: {
        width: 44,
        height: 44,
        borderRadius: 13,
        backgroundColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
        justifyContent: "center",
    },
    dashboardButtonTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    dashboardButtonTitle: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "900",
        marginBottom: 3,
    },
    dashboardButtonText: {
        color: COLORS.text,
        opacity: 0.82,
        fontSize: 13,
        lineHeight: 18,
    },
    profileEditor: {
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.md,
    },
    profileEditorTitle: {
        color: COLORS.text,
        fontSize: 20,
        fontWeight: "900",
        marginBottom: 6,
    },
    profileEditorText: {
        color: COLORS.mutedText,
        fontSize: 14,
        lineHeight: 21,
        marginBottom: SPACING.md,
    },
    input: {
        backgroundColor: COLORS.background,
        color: COLORS.text,
        borderRadius: RADIUS.md,
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.md,
    },
    textarea: {
        minHeight: 100,
        textAlignVertical: "top",
    },
    ageGroupWrap: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: SPACING.md,
    },
    ageGroupChip: {
        paddingHorizontal: 11,
        paddingVertical: 8,
        borderRadius: RADIUS.pill,
        backgroundColor: COLORS.background,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    ageGroupChipSelected: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    ageGroupChipText: {
        color: COLORS.text,
        fontSize: 12,
        fontWeight: "700",
    },
    ageGroupChipTextSelected: {
        color: "#FFFFFF",
    },
    saveProfileButton: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        alignItems: "center",
    },
    saveProfileButtonText: {
        color: COLORS.text,
        fontSize: 15,
        fontWeight: "900",
    },
    buttonDisabled: {
        opacity: 0.7,
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