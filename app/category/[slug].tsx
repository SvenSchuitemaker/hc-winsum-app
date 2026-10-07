import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ExerciseCard from "../../components/ExerciseCard";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

type DbCategory = {
    id: number;
    slug: string;
    title: string;
    image_url: string | null;
    description: string | null;
};

type DbExercise = {
    id: number;
    category_slug: string;
    title: string;
    image_url: string | null;
    difficulty: string | null;
    audience: string[] | null;
};

const difficultyOptions = ["Alle", "Makkelijk", "Gemiddeld", "Moeilijk"];
const audienceOptions = ["Alle", "JO8", "JO10", "JO12", "JO14", "JO16", "JO18", "MO8", "MO10", "MO12", "MO14", "MO16", "MO18", "Senioren"];

export default function CategoryScreen() {
    const { slug } = useLocalSearchParams<{ slug: string }>();
    const router = useRouter();

    const [category, setCategory] = useState<DbCategory | null>(null);
    const [items, setItems] = useState<DbExercise[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorText, setErrorText] = useState("");

    const [search, setSearch] = useState("");
    const [difficultyFilter, setDifficultyFilter] = useState("Alle");
    const [audienceFilter, setAudienceFilter] = useState("Alle");

    useEffect(() => {
        if (slug) {
            loadCategoryData();
        }
    }, [slug]);

    async function loadCategoryData() {
        try {
            if (!supabase) {
                setErrorText("Supabase is niet geladen.");
                setLoading(false);
                return;
            }

            const [{ data: categoryData, error: categoryError }, { data: exerciseData, error: exerciseError }] =
                await Promise.all([
                    supabase.from("categories").select("*").eq("slug", slug).single(),
                    supabase
                        .from("exercises")
                        .select("id, category_slug, title, image_url, difficulty, audience")
                        .eq("category_slug", slug)
                        .order("id", { ascending: true }),
                ]);

            if (categoryError) {
                setErrorText(categoryError.message);
            } else {
                setCategory(categoryData);
            }

            if (exerciseError) {
                setErrorText(exerciseError.message);
            } else {
                setItems(exerciseData || []);
            }
        } catch (error) {
            setErrorText(error instanceof Error ? error.message : "Onbekende fout");
        } finally {
            setLoading(false);
        }
    }

    const filteredItems = useMemo(() => {
        return items.filter((item) => {
            const matchesSearch = item.title
                .toLowerCase()
                .includes(search.trim().toLowerCase());

            const matchesDifficulty =
                difficultyFilter === "Alle" || item.difficulty === difficultyFilter;

            const matchesAudience =
                audienceFilter === "Alle" ||
                (item.audience ?? []).includes(audienceFilter);

            return matchesSearch && matchesDifficulty && matchesAudience;
        });
    }, [items, search, difficultyFilter, audienceFilter]);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.pageContent}>
                <View style={styles.hero}>
                    <Text style={styles.title}>{category?.title || "Categorie"}</Text>
                    <Text style={styles.description}>
                        {category?.description || "Bekijk oefeningen binnen deze categorie."}
                    </Text>
                </View>

                <View style={styles.filtersCard}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Zoek oefening..."
                        placeholderTextColor={COLORS.mutedText}
                        value={search}
                        onChangeText={setSearch}
                    />

                    <Text style={styles.filterLabel}>Moeilijkheid</Text>
                    <View style={styles.chipsRow}>
                        {difficultyOptions.map((option) => {
                            const selected = difficultyFilter === option;
                            return (
                                <Pressable
                                    key={option}
                                    style={[styles.chip, selected && styles.chipSelected]}
                                    onPress={() => setDifficultyFilter(option)}
                                >
                                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                                        {option}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.filterLabel}>Doelgroep</Text>
                    <View style={styles.chipsRow}>
                        {audienceOptions.map((option) => {
                            const selected = audienceFilter === option;
                            return (
                                <Pressable
                                    key={option}
                                    style={[styles.chip, selected && styles.chipSelected]}
                                    onPress={() => setAudienceFilter(option)}
                                >
                                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                                        {option}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color={COLORS.primary} />
                ) : errorText ? (
                    <Text style={styles.errorText}>{errorText}</Text>
                ) : filteredItems.length === 0 ? (
                    <Text style={styles.emptyText}>Geen oefeningen gevonden met deze filters.</Text>
                ) : (
                    <View style={styles.grid}>
                        {filteredItems.map((item) => (
                            <ExerciseCard
                                key={item.id}
                                title={item.title}
                                image={item.image_url || "https://picsum.photos/600/400?random=99"}
                                onPress={() => router.push(`/exercise/${item.id}`)}
                            />
                        ))}
                    </View>
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
    pageContent: {
        width: "100%",
        maxWidth: 1200,
        alignSelf: "center",
    },
    hero: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        marginBottom: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    title: {
        color: COLORS.text,
        fontSize: 26,
        fontWeight: "900",
        marginBottom: 8,
    },
    description: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
    },
    filtersCard: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.md,
        marginBottom: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    searchInput: {
        backgroundColor: COLORS.surfaceLight,
        color: COLORS.text,
        borderRadius: RADIUS.md,
        paddingHorizontal: 14,
        paddingVertical: 14,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    filterLabel: {
        color: COLORS.primaryLight,
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 8,
    },
    chipsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: SPACING.md,
    },
    chip: {
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.pill,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    chipSelected: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    chipText: {
        color: COLORS.text,
        fontWeight: "700",
    },
    chipTextSelected: {
        color: "#FFFFFF",
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
    },
    errorText: {
        color: "#ff7b7b",
        fontSize: 16,
        lineHeight: 24,
    },
    emptyText: {
        color: COLORS.mutedText,
        fontSize: 16,
        lineHeight: 24,
    },
});
