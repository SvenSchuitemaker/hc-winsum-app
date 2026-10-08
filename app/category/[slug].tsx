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
    subtitle: string | null;
    explanation: string | null;
};

const difficultyOptions = ["Alle", "Makkelijk", "Gemiddeld", "Moeilijk"];
const audienceOptions = ["Alle", "JO8", "JO10", "JO12", "JO14", "JO16", "JO18", "MO8", "MO10", "MO12", "MO14", "MO16", "MO18", "Senioren"];
const sortOptions = ["A-Z", "Makkelijk eerst", "Moeilijk eerst"];

const difficultyRank: Record<string, number> = {
    Makkelijk: 1,
    Gemiddeld: 2,
    Moeilijk: 3,
};

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
    const [sortBy, setSortBy] = useState("A-Z");

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
                        .select("id, category_slug, title, image_url, difficulty, audience, subtitle, explanation")
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
        const normalizedSearch = search.trim().toLowerCase();

        const filtered = items.filter((item) => {
            const searchableText = [item.title, item.subtitle, item.explanation]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
            const matchesDifficulty =
                difficultyFilter === "Alle" || item.difficulty === difficultyFilter;
            const matchesAudience =
                audienceFilter === "Alle" ||
                (item.audience ?? []).includes(audienceFilter);

            return matchesSearch && matchesDifficulty && matchesAudience;
        });

        return filtered.sort((a, b) => {
            if (sortBy === "Makkelijk eerst") {
                return (difficultyRank[a.difficulty || ""] || 99) -
                    (difficultyRank[b.difficulty || ""] || 99) ||
                    a.title.localeCompare(b.title);
            }

            if (sortBy === "Moeilijk eerst") {
                return (difficultyRank[b.difficulty || ""] || 0) -
                    (difficultyRank[a.difficulty || ""] || 0) ||
                    a.title.localeCompare(b.title);
            }

            return a.title.localeCompare(b.title);
        });
    }, [items, search, difficultyFilter, audienceFilter, sortBy]);

    const filtersActive =
        !!search.trim() || difficultyFilter !== "Alle" || audienceFilter !== "Alle" || sortBy !== "A-Z";

    function resetFilters() {
        setSearch("");
        setDifficultyFilter("Alle");
        setAudienceFilter("Alle");
        setSortBy("A-Z");
    }

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

                    <Text style={styles.filterLabel}>Sorteren</Text>
                    <View style={styles.chipsRow}>
                        {sortOptions.map((option) => {
                            const selected = sortBy === option;
                            return (
                                <Pressable
                                    key={option}
                                    style={[styles.chip, selected && styles.chipSelected]}
                                    onPress={() => setSortBy(option)}
                                >
                                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                                        {option}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <View style={styles.filterSummary}>
                        <Text style={styles.resultCount}>
                            {filteredItems.length} van {items.length} oefeningen gevonden
                        </Text>
                        {filtersActive && (
                            <Pressable style={styles.resetButton} onPress={resetFilters}>
                                <Text style={styles.resetButtonText}>Filters wissen</Text>
                            </Pressable>
                        )}
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
    filterSummary: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 2,
    },
    resultCount: {
        flex: 1,
        color: COLORS.mutedText,
        fontSize: 13,
        fontWeight: "700",
    },
    resetButton: {
        backgroundColor: COLORS.background,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.pill,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    resetButtonText: {
        color: COLORS.accent,
        fontSize: 12,
        fontWeight: "800",
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
