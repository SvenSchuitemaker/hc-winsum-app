import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import ExerciseCard from "../../components/ExerciseCard";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

type FavoriteExercise = {
    id: number;
    title: string;
    image_url: string | null;
};

export default function FavorietenScreen() {
    const router = useRouter();
    const { user } = useAuth();

    const [items, setItems] = useState<FavoriteExercise[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorText, setErrorText] = useState("");

    useEffect(() => {
        if (user) {
            loadFavorites();
        } else {
            setItems([]);
            setLoading(false);
        }
    }, [user]);

    async function loadFavorites() {
        try {
            if (!supabase || !user) {
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from("favorites")
                .select(`
          exercise_id,
          exercises (
            id,
            title,
            image_url
          )
        `)
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });

            if (error) {
                setErrorText(error.message);
                return;
            }

            const mapped =
                data
                    ?.map((item: any) => item.exercises)
                    .filter(Boolean) ?? [];

            setItems(mapped);
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "Onbekende fout");
        } finally {
            setLoading(false);
        }
    }

    if (!user) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Favorieten</Text>
                <Text style={styles.text}>Log in om jouw favoriete oefeningen te bekijken.</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                <Text style={styles.title}>Favorieten</Text>
                <Text style={styles.text}>Jouw opgeslagen oefeningen.</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={COLORS.primary} />
            ) : errorText ? (
                <Text style={styles.errorText}>{errorText}</Text>
            ) : items.length === 0 ? (
                <Text style={styles.emptyText}>Je hebt nog geen favoriete oefeningen.</Text>
            ) : (
                <View style={styles.grid}>
                    {items.map((item) => (
                        <ExerciseCard
                            key={item.id}
                            title={item.title}
                            image={item.image_url || "https://picsum.photos/600/400?random=99"}
                            onPress={() => router.push(`/exercise/${item.id}`)}
                        />
                    ))}
                </View>
            )}
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
    title: { color: COLORS.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
    text: { color: COLORS.mutedText, fontSize: 16, lineHeight: 24 },
    emptyText: {
        color: COLORS.mutedText,
        fontSize: 16,
        lineHeight: 24,
    },
    errorText: {
        color: "#ff7b7b",
        fontSize: 16,
        lineHeight: 24,
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
    },
});