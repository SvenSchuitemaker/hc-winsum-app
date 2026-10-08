import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { signIn } from "../lib/auth";
import { supabase } from "../lib/supabase";

const PENDING_CLUB_KEY = "pending_registration_club";

type PendingClub = {
    email: string;
    clubId: number;
    clubName: string;
    fullName?: string;
    phone?: string;
    specialty?: string;
    ageGroups?: string[];
    bio?: string;
};

export default function LoginScreen() {
    const params = useLocalSearchParams<{ registered?: string }>();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [errorText, setErrorText] = useState("");

    async function attachPendingClub(userId: string, loginEmail: string) {
        if (!supabase) return;

        const stored = await AsyncStorage.getItem(PENDING_CLUB_KEY);
        if (!stored) return;

        let pending: PendingClub;

        try {
            pending = JSON.parse(stored) as PendingClub;
        } catch {
            await AsyncStorage.removeItem(PENDING_CLUB_KEY);
            return;
        }

        if (pending.email.toLowerCase() !== loginEmail.toLowerCase()) {
            return;
        }

        const { error } = await supabase
            .from("profiles")
            .update({
                club_id: pending.clubId,
                ...(pending.fullName !== undefined ? { full_name: pending.fullName.trim() || null } : {}),
                ...(pending.phone !== undefined ? { phone: pending.phone.trim() || null } : {}),
                ...(pending.specialty !== undefined ? { specialty: pending.specialty.trim() || null } : {}),
                ...(pending.ageGroups !== undefined ? { age_groups: pending.ageGroups } : {}),
                ...(pending.bio !== undefined ? { bio: pending.bio.trim() || null } : {}),
            })
            .eq("id", userId);

        if (error) throw error;
        await AsyncStorage.removeItem(PENDING_CLUB_KEY);
    }

    async function handleLogin() {
        if (!email.trim() || !password) {
            setErrorText("Vul je e-mailadres en wachtwoord in.");
            return;
        }

        try {
            setLoading(true);
            setErrorText("");

            const normalizedEmail = email.trim().toLowerCase();
            const data = await signIn(normalizedEmail, password);

            if (data.user?.id) {
                await attachPendingClub(data.user.id, normalizedEmail);
            }

            router.replace("/");
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "Inloggen mislukt.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <Text style={styles.title}>Welkom terug</Text>
                <Text style={styles.subtitle}>Log in met je account</Text>

                {params.registered === "1" && (
                    <View style={styles.successBox}>
                        <Text style={styles.successText}>
                            Je account is aangemaakt. Bevestig je e-mailadres als je een bevestigingsmail hebt ontvangen en log daarna hier in.
                        </Text>
                    </View>
                )}

                <TextInput
                    style={styles.input}
                    placeholder="E-mailadres"
                    placeholderTextColor={COLORS.mutedText}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                />

                <TextInput
                    style={styles.input}
                    placeholder="Wachtwoord"
                    placeholderTextColor={COLORS.mutedText}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                />

                {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

                <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
                    {loading ? (
                        <ActivityIndicator color={COLORS.text} />
                    ) : (
                        <Text style={styles.buttonText}>Inloggen</Text>
                    )}
                </Pressable>

                <Link href="/register" style={styles.link}>
                    Nog geen account? Maak er één aan
                </Link>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
        justifyContent: "center",
        padding: SPACING.md,
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
        marginBottom: 6,
    },
    subtitle: {
        color: COLORS.primaryLight,
        fontSize: 15,
        marginBottom: SPACING.lg,
    },
    successBox: {
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.primary,
        borderRadius: RADIUS.md,
        padding: 12,
        marginBottom: SPACING.md,
    },
    successText: {
        color: COLORS.text,
        fontSize: 14,
        lineHeight: 20,
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
    buttonText: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: "800",
    },
    link: {
        color: COLORS.accent,
        marginTop: SPACING.md,
        textAlign: "center",
        fontWeight: "700",
    },
    errorText: {
        color: "#ff7b7b",
        marginBottom: SPACING.sm,
    },
});
