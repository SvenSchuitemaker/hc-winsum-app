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

export default function RegisterScreen() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [clubCode, setClubCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [errorText, setErrorText] = useState("");

    async function attachClubToProfile(userId: string, clubId: number) {
        if (!supabase) return;

        const { data: profile } = await supabase
            .from("profiles")
            .select("club_id")
            .eq("id", userId)
            .maybeSingle();

        if (profile?.club_id) return;

        await supabase
            .from("profiles")
            .update({ club_id: clubId })
            .eq("id", userId);
    }

    async function handleRegister() {
        if (!email.trim() || !password.trim() || !clubCode.trim()) {
            setErrorText("Vul e-mail, wachtwoord en clubcode in.");
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
                await attachClubToProfile(userId, club.id);
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
                })
            );

            Alert.alert(
                "Controleer je e-mail",
                "Je account is aangemaakt. Bevestig eerst je e-mailadres en log daarna in."
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
                    placeholder="CLUBCODE"
                    placeholderTextColor={COLORS.mutedText}
                    autoCapitalize="characters"
                    value={clubCode}
                    onChangeText={setClubCode}
                />

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
    errorText: {
        color: "#ff7b7b",
        marginBottom: SPACING.md,
        lineHeight: 20,
    },
});
