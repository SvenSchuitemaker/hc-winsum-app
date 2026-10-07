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

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function RegisterScreen() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [clubCode, setClubCode] = useState("");
    const [loading, setLoading] = useState(false);

    async function attachClubToProfile(userId: string, clubId: number) {
        if (!supabase) {
            throw new Error("Supabase is niet geladen.");
        }

        let lastError: string | null = null;

        for (let attempt = 0; attempt < 8; attempt++) {
            const { error } = await supabase
                .from("profiles")
                .update({ club_id: clubId })
                .eq("id", userId);

            if (!error) {
                return;
            }

            lastError = error.message;
            await sleep(400);
        }

        throw new Error(lastError || "Club kon niet aan profiel gekoppeld worden.");
    }

    async function handleRegister() {
        if (!email.trim() || !password.trim() || !clubCode.trim()) {
            Alert.alert("Ontbrekende velden", "Vul e-mail, wachtwoord en clubcode in.");
            return;
        }

        try {
            setLoading(true);

            if (!supabase) {
                throw new Error("Supabase is niet geladen.");
            }

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
                email: email.trim(),
                password: password.trim(),
            });

            if (signUpError) {
                throw signUpError;
            }

            const userId = signUpData.user?.id;

            if (!userId) {
                throw new Error("Account aangemaakt, maar gebruiker kon niet worden opgehaald.");
            }

            await attachClubToProfile(userId, club.id);

            Alert.alert(
                "Account aangemaakt",
                `Je account is gekoppeld aan ${club.name}.`
            );

            router.replace("/");
        } catch (error) {
            Alert.alert(
                "Registratie mislukt",
                error instanceof Error ? error.message : "Er ging iets mis."
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
                    Maak een account aan en koppel jezelf direct aan je club met de clubcode.
                </Text>

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
                    placeholder="K7P4-X9QM-2L8V"
                    placeholderTextColor={COLORS.mutedText}
                    autoCapitalize="characters"
                    value={clubCode}
                    onChangeText={setClubCode}
                />

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

                <Pressable style={styles.linkButton} onPress={() => router.push("/login")}>
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
        justifyContent: "center",
        flexGrow: 1,
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
});