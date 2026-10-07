import { Link, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { signIn } from "../lib/auth";

export default function LoginScreen() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [errorText, setErrorText] = useState("");

    async function handleLogin() {
        try {
            setLoading(true);
            setErrorText("");
            await signIn(email.trim(), password);
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