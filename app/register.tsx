import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useState } from "react";
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
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { supabase } from "../lib/supabase";

type ClubRow = {
    id: number;
    name: string;
    club_code: string;
};

const PENDING_CLUB_KEY = "pending_registration_club";
const AGE_GROUP_OPTIONS = [
    "JO8",
    "JO10",
    "JO12",
    "JO14",
    "JO16",
    "JO18",
    "MO8",
    "MO10",
    "MO12",
    "MO14",
    "MO16",
    "MO18",
    "Senioren",
];

export default function RegisterScreen() {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [phone, setPhone] = useState("");
    const [specialty, setSpecialty] = useState("");
    const [ageGroups, setAgeGroups] = useState<string[]>([]);
    const [bio, setBio] = useState("");
    const [clubCode, setClubCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [errorText, setErrorText] = useState("");

    function toggleAgeGroup(ageGroup: string) {
        setAgeGroups((current) =>
            current.includes(ageGroup)
                ? current.filter((item) => item !== ageGroup)
                : [...current, ageGroup]
        );
    }

    async function updateProfile(userId: string, clubId: number) {
        if (!supabase) return;

        const { error } = await supabase
            .from("profiles")
            .update({
                club_id: clubId,
                full_name: fullName.trim() || null,
                phone: phone.trim() || null,
                specialty: specialty.trim() || null,
                age_groups: ageGroups,
                bio: bio.trim() || null,
            })
            .eq("id", userId);

        if (error) throw error;
    }

    async function handleRegister() {
        if (!fullName.trim() || !email.trim() || !password.trim() || !clubCode.trim()) {
            setErrorText("Vul je naam, e-mail, wachtwoord en clubcode in.");
            return;
        }

        try {
            setLoading(true);
            setErrorText("");

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

            const normalizedEmail = email.trim().toLowerCase();
            const normalizedClubCode = clubCode.trim().toUpperCase();

            const { data: clubData, error: clubError } = await supabase
                .from("clubs")
                .select("id, name, club_code")
                .eq("club_code", normalizedClubCode)
                .single();

            if (clubError || !clubData) {
                throw new Error("Ongeldige clubcode.");
            }

            const club = clubData as ClubRow;

            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email: normalizedEmail,
                password: password.trim(),
            });

            if (signUpError) {
                throw signUpError;
            }

            const userId = signUpData.user?.id;

            if (!userId) {
                throw new Error("Account aangemaakt, maar gebruiker kon niet worden opgehaald.");
            }

            if (signUpData.session) {
                await updateProfile(userId, club.id);
                await AsyncStorage.removeItem(PENDING_CLUB_KEY);
                router.replace("/");
                return;
            }

            await AsyncStorage.setItem(
                PENDING_CLUB_KEY,
                JSON.stringify({
                    email: normalizedEmail,
                    clubId: club.id,
                    clubName: club.name,
                    fullName: fullName.trim(),
                    phone: phone.trim(),
                    specialty: specialty.trim(),
                    ageGroups,
                    bio: bio.trim(),
                })
            );

            Alert.alert(
                "Controleer je e-mail",
                "Je account is aangemaakt. Bevestig eerst je e-mailadres en log daarna in. Je trainerprofiel wordt dan automatisch gekoppeld."
            );

            router.replace("/login?registered=1");
        } catch (error) {
            setErrorText(
                error instanceof Error ? error.message : "Registratie mislukt."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                <Text style={styles.title}>Account aanmaken</Text>
                <Text style={styles.text}>
                    Maak je traineraccount aan en vul meteen je profielgegevens in.
                </Text>

                <Text style={styles.sectionTitle}>Account</Text>

                <Text style={styles.label}>Naam</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Voor- en achternaam"
                    placeholderTextColor={COLORS.mutedText}
                    autoCapitalize="words"
                    value={fullName}
                    onChangeText={setFullName}
                />

                <Text style={styles.label}>E-mail</Text>
                <TextInput
                    style={styles.input}
                    placeholder="jij@email.nl"
                    placeholderTextColor={COLORS.mutedText}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                />

                <Text style={styles.label}>Wachtwoord</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Wachtwoord"
                    placeholderTextColor={COLORS.mutedText}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                />

                <Text style={styles.label}>Clubcode</Text>
                <TextInput
                    style={styles.input}
                    placeholder="CLUBCODE"
                    placeholderTextColor={COLORS.mutedText}
                    autoCapitalize="characters"
                    value={clubCode}
                    onChangeText={setClubCode}
                />

                <Text style={styles.sectionTitle}>Trainerprofiel</Text>

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
                                style={[
                                    styles.ageGroupChip,
                                    selected && styles.ageGroupChipSelected,
                                ]}
                                onPress={() => toggleAgeGroup(ageGroup)}
                            >
                                <Text
                                    style={[
                                        styles.ageGroupChipText,
                                        selected && styles.ageGroupChipTextSelected,
                                    ]}
                                >
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

                <Text style={styles.optionalText}>
                    Telefoonnummer, specialisme, leeftijdsgroepen en bio kun je later ook nog aanpassen.
                </Text>

                {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

                <Pressable
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleRegister}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color={COLORS.text} />
                    ) : (
                        <Text style={styles.buttonText}>Account aanmaken</Text>
                    )}
                </Pressable>

                <Pressable style={styles.linkButton} onPress={() => router.replace("/login")}>
                    <Text style={styles.linkText}>Ik heb al een account</Text>
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
        flexGrow: 1,
    },
    card: {
        width: "100%",
        maxWidth: 680,
        alignSelf: "center",
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    title: {
        color: COLORS.text,
        fontSize: 28,
        fontWeight: "900",
        marginBottom: 10,
    },
    text: {
        color: COLORS.mutedText,
        fontSize: 16,
        lineHeight: 24,
        marginBottom: SPACING.lg,
    },
    sectionTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "900",
        marginTop: 4,
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
        backgroundColor: COLORS.surfaceLight,
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
    optionalText: {
        color: COLORS.mutedText,
        fontSize: 12,
        lineHeight: 18,
        marginBottom: SPACING.md,
    },
    button: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        alignItems: "center",
        marginTop: 4,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 16,
    },
    linkButton: {
        marginTop: SPACING.md,
        alignItems: "center",
    },
    linkText: {
        color: COLORS.accent,
        fontSize: 15,
        fontWeight: "700",
    },
    errorText: {
        color: "#ff7b7b",
        marginBottom: SPACING.md,
        lineHeight: 20,
    },
});
