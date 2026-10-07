import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type DbExercise = {
    id: number;
    category_slug: string;
    title: string;
    image_url: string | null;
    subtitle: string | null;
    explanation: string | null;
    instructions: string | null;
    simplify: string | null;
    build_up: string | null;
    difficulty: string | null;
    audience: string[];
};

function InfoBadge({ label }: { label: string }) {
    return (
        <View style={styles.badge}>
            <Text style={styles.badgeText}>{label}</Text>
        </View>
    );
}

function Section({ title, text }: { title: string; text?: string | null }) {
    if (!text) return null;

    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.sectionText}>{text}</Text>
        </View>
    );
}

const fallbackImage = "https://picsum.photos/900/600?random=77";

export default function ExerciseDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user, role } = useAuth();
    const { width } = useWindowDimensions();

    const [exercise, setExercise] = useState<DbExercise | null>(null);
    const [loading, setLoading] = useState(true);
    const [errorText, setErrorText] = useState("");
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const isAdmin = role === "super_admin";
    const isDesktop = width >= 900;

    useEffect(() => {
        if (id) {
            loadExercise();
        }
    }, [id]);

    useEffect(() => {
        if (id && user) {
            loadFavoriteStatus();
        } else {
            setIsFavorite(false);
        }
    }, [id, user]);

    async function loadExercise() {
        try {
            if (!supabase) {
                setErrorText("Supabase is niet geladen.");
                setLoading(false);
                return;
            }

            const numericId = Number(id);

            const { data, error } = await supabase
                .from("exercises")
                .select("*")
                .eq("id", numericId)
                .single();

            if (error) {
                setErrorText(error.message);
            } else {
                setExercise(data);
            }
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "Onbekende fout");
        } finally {
            setLoading(false);
        }
    }

    async function loadFavoriteStatus() {
        try {
            if (!supabase || !user) return;

            const numericId = Number(id);

            const { data, error } = await supabase
                .from("favorites")
                .select("id")
                .eq("user_id", user.id)
                .eq("exercise_id", numericId)
                .maybeSingle();

            if (!error) {
                setIsFavorite(!!data);
            }
        } catch {
            setIsFavorite(false);
        }
    }

    async function toggleFavorite() {
        if (!user) {
            Alert.alert("Inloggen vereist", "Log eerst in om favorieten op te slaan.");
            return;
        }

        try {
            setFavoriteLoading(true);

            if (!supabase || !exercise) {
                throw new Error("Supabase of oefening niet geladen.");
            }

            if (isFavorite) {
                const { error } = await supabase
                    .from("favorites")
                    .delete()
                    .eq("user_id", user.id)
                    .eq("exercise_id", exercise.id);

                if (error) throw error;
                setIsFavorite(false);
            } else {
                const { error } = await supabase.from("favorites").insert({
                    user_id: user.id,
                    exercise_id: exercise.id,
                });

                if (error) throw error;
                setIsFavorite(true);
            }
        } catch (error) {
            Alert.alert("Fout", error instanceof Error ? error.message : "Favoriet opslaan mislukt.");
        } finally {
            setFavoriteLoading(false);
        }
    }

    async function handleShare() {
        if (!exercise) return;

        const audienceText =
            exercise.audience && exercise.audience.length > 0
                ? exercise.audience.join(", ")
                : "-";

        const shareText = [
            `*Oefening:* ${exercise.title}`,
            exercise.subtitle ? `${exercise.subtitle}` : null,
            `*Moeilijkheid:* ${exercise.difficulty || "-"}`,
            `*Doelgroep:* ${audienceText}`,
            "",
            exercise.explanation ? `*Uitleg:*\n${exercise.explanation}` : null,
            exercise.instructions ? `*Instructies:*\n${exercise.instructions}` : null,
            exercise.simplify ? `*Vereenvoudiging:*\n${exercise.simplify}` : null,
            exercise.build_up ? `*Uitbouw:*\n${exercise.build_up}` : null,
        ]
            .filter(Boolean)
            .join("\n\n");

        try {
            await Share.share({
                message: shareText,
            });
        } catch (error) {
            Alert.alert("Fout", error instanceof Error ? error.message : "Delen mislukt.");
        }
    }

    function confirmDelete() {
        if (!isAdmin) {
            Alert.alert("Geen toegang", "Alleen admins mogen oefeningen verwijderen.");
            return;
        }

        Alert.alert(
            "Oefening verwijderen",
            "Weet je zeker dat je deze oefening wilt verwijderen?",
            [
                { text: "Annuleren", style: "cancel" },
                { text: "Verwijderen", style: "destructive", onPress: handleDelete },
            ]
        );
    }

    async function handleDelete() {
        try {
            setDeleting(true);

            if (!supabase || !exercise) {
                throw new Error("Oefening niet geladen.");
            }

            const { error } = await supabase.from("exercises").delete().eq("id", exercise.id);

            if (error) throw error;

            Alert.alert("Verwijderd", "De oefening is verwijderd.");
            router.replace(`/category/${exercise.category_slug}`);
        } catch (error) {
            Alert.alert("Fout", error instanceof Error ? error.message : "Verwijderen mislukt.");
        } finally {
            setDeleting(false);
        }
    }

    if (loading) {
        return (
            <View style={styles.notFound}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (errorText) {
        return (
            <View style={styles.notFound}>
                <Text style={styles.notFoundText}>{errorText}</Text>
            </View>
        );
    }

    if (!exercise) {
        return (
            <View style={styles.notFound}>
                <Text style={styles.notFoundText}>Oefening niet gevonden.</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={[styles.pageContent, isDesktop && styles.pageContentDesktop]}>
                <View style={[styles.imageWrap, isDesktop && styles.imageWrapDesktop]}>
                    <Image
                        source={{ uri: exercise.image_url || fallbackImage }}
                        style={styles.image}
                        resizeMode="contain"
                    />
                </View>

                <View style={styles.titleRow}>
                    <View style={styles.titleWrap}>
                        <Text style={styles.pageTitle}>{exercise.title}</Text>
                        {!!exercise.subtitle && <Text style={styles.subtitle}>{exercise.subtitle}</Text>}
                    </View>

                    <Pressable
                        style={styles.favoriteButton}
                        onPress={toggleFavorite}
                        disabled={favoriteLoading}
                    >
                        {favoriteLoading ? (
                            <ActivityIndicator color={COLORS.text} />
                        ) : (
                            <Ionicons
                                name={isFavorite ? "heart" : "heart-outline"}
                                size={28}
                                color={isFavorite ? "#ff6b81" : COLORS.text}
                            />
                        )}
                    </Pressable>
                </View>

                {isAdmin && (
                    <View style={styles.adminActionRow}>
                        <Pressable
                            style={styles.iconActionButton}
                            onPress={() => router.push(`/exercise-bewerk/${exercise.id}`)}
                        >
                            <Ionicons name="brush-outline" size={20} color={COLORS.text} />
                        </Pressable>

                        <Pressable
                            style={[styles.deleteIconButton, deleting && styles.deleteButtonDisabled]}
                            onPress={confirmDelete}
                            disabled={deleting}
                        >
                            {deleting ? (
                                <ActivityIndicator size="small" color="#C0392B" />
                            ) : (
                                <Ionicons name="trash-outline" size={20} color="#C0392B" />
                            )}
                        </Pressable>
                    </View>
                )}

                <View style={styles.badgesRow}>
                    {!!exercise.difficulty && <InfoBadge label={exercise.difficulty} />}
                    {exercise.audience?.map((item) => (
                        <InfoBadge key={item} label={item} />
                    ))}
                </View>

                <Section title="Uitleg" text={exercise.explanation} />
                <Section title="Instructies" text={exercise.instructions} />
                <Section title="Vereenvoudiging" text={exercise.simplify} />
                <Section title="Uitbouw" text={exercise.build_up} />

                <Pressable style={styles.button} onPress={handleShare}>
                    <Text style={styles.buttonText}>Oefening delen</Text>
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
    pageContent: {
        width: "100%",
    },
    pageContentDesktop: {
        width: "100%",
        maxWidth: 1180,
        alignSelf: "center",
    },
    imageWrap: {
        width: "100%",
        aspectRatio: 1,
        borderRadius: RADIUS.xl,
        overflow: "hidden",
        marginBottom: SPACING.lg,
        backgroundColor: "#4EAF00",
    },
    imageWrapDesktop: {
        aspectRatio: 16 / 9,
        maxHeight: 640,
    },
    image: {
        width: "100%",
        height: "100%",
    },
    titleRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 8,
    },
    titleWrap: {
        flex: 1,
    },
    pageTitle: {
        color: COLORS.text,
        fontSize: 28,
        fontWeight: "900",
        marginBottom: 6,
    },
    subtitle: {
        color: COLORS.primaryLight,
        fontSize: 17,
        fontWeight: "700",
        marginBottom: SPACING.md,
    },
    favoriteButton: {
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.pill,
        padding: 10,
    },
    adminActionRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: SPACING.lg,
    },
    iconActionButton: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: COLORS.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    deleteIconButton: {
        width: 40,
        height: 40,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#C0392B",
        backgroundColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
    },
    deleteButtonDisabled: {
        opacity: 0.7,
    },
    badgesRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: SPACING.lg,
    },
    badge: {
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: RADIUS.pill,
    },
    badgeText: {
        color: COLORS.accent,
        fontSize: 13,
        fontWeight: "800",
    },
    section: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.lg,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
        marginBottom: SPACING.md,
    },
    sectionTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "900",
        marginBottom: 8,
    },
    sectionText: {
        color: COLORS.mutedText,
        fontSize: 16,
        lineHeight: 25,
    },
    button: {
        marginTop: 8,
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.md,
        paddingVertical: 15,
        alignItems: "center",
    },
    buttonText: {
        color: COLORS.text,
        fontSize: 17,
        fontWeight: "900",
    },
    notFound: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.background,
        padding: SPACING.md,
    },
    notFoundText: {
        color: COLORS.text,
        fontSize: 18,
        textAlign: "center",
    },
});
