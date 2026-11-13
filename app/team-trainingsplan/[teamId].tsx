import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
    ActivityIndicator, Keyboard,
    Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import ExercisePicker, { type ExerciseCategory, type ExerciseChoice } from "../../components/ExercisePicker";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import {
    planDateAfterDays, planDateLabel, planDayCount, planEnd,
    type TeamTrainingPlan, type TrainingPhase,
} from "../../lib/teamTrainingPlans";

type Exercise = ExerciseChoice<number>;
const exerciseLimit = 50;
type PlanDraft = {
    id?: number;
    start: string;
    months: 3 | 6;
    phases: { goal: string; weeks: string; exerciseIds: number[] }[];
};

const emptyPhase = () => ({ goal: "", weeks: "1", exerciseIds: [] });
const exerciseCount = (count: number) => count === 1 ? "1 oefening" : `${count} oefeningen`;
const weekCount = (count: string) => count === "1" ? "1 week" : `${count || "0"} weken`;
const planLabel = (months: number) => months === 3 ? "Kwartaal" : "Half jaar";

function Button({ children, onPress, disabled, selected }: {
    children: ReactNode;
    onPress: () => void;
    disabled?: boolean;
    selected?: boolean;
}) {
    return (
        <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }}
            onPress={onPress} disabled={disabled}
            style={[styles.button, selected && styles.selected, disabled && styles.disabled]}>
            <Text style={styles.buttonText}>{children}</Text>
        </Pressable>
    );
}

export default function TeamTrainingPlansScreen() {
    const { teamId } = useLocalSearchParams<{ teamId: string }>();
    const { user, role, loading: authLoading } = useAuth();
    const canManage = role === "head_trainer" || role === "super_admin";
    const [teamName, setTeamName] = useState("");
    const [plans, setPlans] = useState<TeamTrainingPlan[]>([]);
    const [exercises, setExercises] = useState<Exercise[]>([]);
    const [categories, setCategories] = useState<ExerciseCategory[]>([]);
    const [draft, setDraft] = useState<PlanDraft | null>(null);
    const [pickerPhase, setPickerPhase] = useState<number | null>(null);
    const [expandedPhase, setExpandedPhase] = useState<number | null>(0);
    const [expandedPlan, setExpandedPlan] = useState<number | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [error, setError] = useState("");
    const [saveSummary, setSaveSummary] = useState("");
    const scroll = useRef<ScrollView>(null);

    useEffect(() => {
        let active = true;
        const client = supabase;
        if (!client || !user || !/^\d+$/.test(teamId ?? "")) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError("");
        setSaveSummary("");
        setDraft(null);
        setPickerPhase(null);
        setExpandedPlan(null);
        setConfirmDelete(null);

        async function load() {
            if (!client) return;
            try {
                const [team, result, categoryResult] = await Promise.all([
                    client.from("teams").select("name").eq("id", Number(teamId)).single(),
                    client.from("team_training_plans").select("id, starts_on, ends_before, months, phases")
                        .eq("team_id", Number(teamId)).order("starts_on", { ascending: false }).order("id"),
                    client.from("categories").select("slug, title").order("id", { ascending: true }),
                ]);
                if (team.error || result.error || categoryResult.error) {
                    throw team.error || result.error || categoryResult.error;
                }

                const catalog: Exercise[] = [];
                for (let offset = 0; active; offset += 500) {
                    const page = await client.from("exercises").select("id, title, category_slug, image_url")
                        .order("title").order("id").range(offset, offset + 499);
                    if (page.error) throw page.error;
                    catalog.push(...page.data);
                    if (page.data.length < 500) break;
                }
                if (!active) return;
                setTeamName(team.data.name);
                setPlans(result.data as TeamTrainingPlan[]);
                setExercises(catalog);
                setCategories(categoryResult.data ?? []);
            } catch {
                if (active) setLoadError("Trainingsplannen konden niet worden geladen.");
            } finally {
                if (active) setLoading(false);
            }
        }
        void load();
        return () => { active = false; };
    }, [teamId, user]);

    const exercisesById = new Map(exercises.map(exercise => [exercise.id, exercise]));
    const start = draft?.start.split("-").reverse().join("-") ?? "";
    const end = draft ? planEnd(start, draft.months) : null;
    const maxWeeks = end ? Math.ceil(planDayCount(start, end) / 7) : 0;
    const usedWeeks = draft?.phases.reduce((total, phase) => total + (Number(phase.weeks) || 0), 0) ?? 0;

    function openDraft(plan?: TeamTrainingPlan) {
        scroll.current?.scrollTo({ y: 0, animated: false });
        setSaveSummary("");
        const now = new Date();
        const today = [String(now.getDate()).padStart(2, "0"), String(now.getMonth() + 1).padStart(2, "0"), now.getFullYear()].join("-");
        setDraft(plan ? {
            id: plan.id,
            start: planDateLabel(plan.starts_on),
            months: plan.months,
            phases: plan.phases.map(phase => ({ ...phase, weeks: String(phase.weeks) })),
        } : { start: today, months: 3, phases: [emptyPhase()] });
        setPickerPhase(null);
        setExpandedPhase(0);
        setConfirmDelete(null);
        setError("");
    }

    function changePhase(index: number, patch: Partial<PlanDraft["phases"][number]>) {
        setDraft(current => current && {
            ...current,
            phases: current.phases.map((phase, position) => position === index ? { ...phase, ...patch } : phase),
        });
    }

    async function save() {
        if (!supabase || !draft || !canManage || saving) return;
        if (!end || start < "0001-01-01" || start > "9999-06-30") {
            setError("Vul een geldige startdatum in (dd-mm-jjjj).");
            return;
        }
        const incompletePhase = draft.phases.findIndex(phase => !phase.goal.trim() || !/^[1-9][0-9]*$/.test(phase.weeks));
        if (incompletePhase !== -1) {
            setExpandedPhase(incompletePhase);
            setError(`Vul bij trainingsdoel ${incompletePhase + 1} een doel en een positief aantal weken in.`);
            return;
        }
        if (usedWeeks !== maxWeeks) {
            setError(`Verdeel alle ${maxWeeks} weken van het plan over de trainingsdoelen. Nu ingepland: ${usedWeeks}.`);
            return;
        }

        const emptyExercisePhase = draft.phases.findIndex(phase => phase.exerciseIds.length === 0);
        if (emptyExercisePhase !== -1) {
            setExpandedPhase(emptyExercisePhase);
            setError(`Kies minstens één oefening bij trainingsdoel ${emptyExercisePhase + 1}.`);
            return;
        }

        const phases: TrainingPhase[] = draft.phases.map(phase => ({
            goal: phase.goal.trim(), weeks: Number(phase.weeks), exerciseIds: phase.exerciseIds,
        }));
        setSaving(true);
        setError("");
        try {
            const result = await supabase.rpc("save_team_training_plan", {
                p_team_id: Number(teamId),
                p_plan_id: draft.id ?? null,
                p_starts_on: start,
                p_months: draft.months,
                p_phases: phases,
            });
            if (result.error) {
                setError(result.error.code === "P0001" || result.error.code === "42501"
                    ? result.error.message
                    : "Het plan en de trainingen konden niet worden opgeslagen. Probeer het opnieuw.");
                return;
            }
            const { plan: saved, created, skipped } = result.data as {
                plan: TeamTrainingPlan; created: number; skipped: number;
            };
            setSaveSummary(`${created} ${created === 1 ? "training aangemaakt" : "trainingen aangemaakt"}.${skipped
                ? ` ${skipped} ${skipped === 1 ? "roostermoment overgeslagen" : "roostermomenten overgeslagen"} vanwege bestaande trainingen.`
                : ""}`);
            scroll.current?.scrollTo({ y: 0, animated: false });
            setPlans(current => [...current.filter(plan => plan.id !== saved.id), saved]
                .sort((a, b) => b.starts_on.localeCompare(a.starts_on) || a.id - b.id));
            setExpandedPlan(saved.id);
            setDraft(null);
        } catch {
            setError("Opslaan mislukt. Probeer het opnieuw.");
        } finally {
            setSaving(false);
        }
    }

    async function remove(id: number) {
        if (!supabase || !canManage || saving) return;
        setSaving(true);
        setError("");
        try {
            const result = await supabase.from("team_training_plans").delete()
                .eq("team_id", Number(teamId)).eq("id", id).select("id").single();
            if (result.error) throw result.error;
            setPlans(current => current.filter(plan => plan.id !== id));
            setConfirmDelete(null);
        } catch {
            setError("Verwijderen mislukt. Probeer het opnieuw.");
        } finally {
            setSaving(false);
        }
    }

    if (authLoading || loading) return <ActivityIndicator color={COLORS.primary} />;
    if (!user || !teamName || loadError) {
        return <Text style={[styles.text, styles.container]}>{loadError || "Dit team is niet beschikbaar."}</Text>;
    }

    const pickedPhase = pickerPhase === null ? undefined : draft?.phases[pickerPhase];

    return (
        <View style={styles.screen}>
            <ScrollView ref={scroll} style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{teamName}</Text>
                {!draft && !!saveSummary && (
                    <Text accessibilityLiveRegion="polite" style={styles.text}>{saveSummary}</Text>
                )}
                {canManage && !draft && <Button onPress={() => openDraft()} disabled={saving}>Nieuw trainingsplan</Button>}
                {draft && canManage && (
                    <View style={styles.card}>
                        <Text style={styles.heading}>{draft.id ? "Trainingsplan bewerken" : "Nieuw trainingsplan"}</Text>
                        <View style={styles.row}>
                            {([3, 6] as const).map(months => (
                                <Button key={months} selected={draft.months === months} disabled={saving}
                                    onPress={() => setDraft({ ...draft, months })}>{planLabel(months)}</Button>
                            ))}
                        </View>
                        <View style={styles.dateRow}>
                            <View style={styles.dateField}>
                                <Text style={styles.muted}>Startdatum</Text>
                                <TextInput accessibilityLabel="Startdatum (dd-mm-jjjj)" style={styles.input}
                                    value={draft.start} maxLength={10} editable={!saving}
                                    placeholder="dd-mm-jjjj" placeholderTextColor={COLORS.mutedText}
                                    onChangeText={value => setDraft({ ...draft, start: value })} />
                            </View>
                            {end && (
                                <View style={styles.dateField}>
                                    <Text style={styles.muted}>Tot en met</Text>
                                    <Text style={styles.endDate}>{planDateLabel(planDateAfterDays(end, -1))}</Text>
                                </View>
                            )}
                        </View>
                        {end && <Text style={styles.muted}>{usedWeeks} van {maxWeeks} weken ingepland</Text>}
                        <Text style={styles.muted}>Op elk vrij moment uit het vaste teamrooster wordt een training aangemaakt. De gekozen oefeningen komen elke week van het trainingsdoel terug.</Text>
                    </View>
                )}
                {draft && canManage && (
                    <View style={styles.card}>
                        <Text style={styles.heading}>Trainingsdoelen</Text>
                        {draft.phases.map((phase, index) => {
                            const expanded = expandedPhase === index;
                            return (
                                <View key={index} style={styles.phase}>
                                    <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
                                        style={styles.summaryRow}
                                        onPress={() => setExpandedPhase(expanded ? null : index)}>
                                        <View style={styles.summaryText}>
                                            <Text style={styles.itemTitle} numberOfLines={expanded ? 2 : 1}>
                                                {phase.goal.trim() || `Trainingsdoel ${index + 1}`}
                                            </Text>
                                            <Text style={styles.muted}>{weekCount(phase.weeks)} · {exerciseCount(phase.exerciseIds.length)}</Text>
                                        </View>
                                        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.mutedText} />
                                    </Pressable>
                                    {expanded && (
                                        <View style={styles.phaseFields}>
                                            <TextInput accessibilityLabel={`Trainingsdoel ${index + 1}`} style={styles.input}
                                                placeholder="Bijvoorbeeld aannemen onder druk" placeholderTextColor={COLORS.mutedText}
                                                value={phase.goal} maxLength={300} editable={!saving}
                                                onChangeText={goal => changePhase(index, { goal })} />
                                            <View style={styles.summaryRow}>
                                                <Text style={[styles.text, styles.summaryText]}>Weken herhalen</Text>
                                                <TextInput accessibilityLabel={`Aantal weken voor trainingsdoel ${index + 1}`}
                                                    style={[styles.input, styles.weekInput]} value={phase.weeks}
                                                    keyboardType="number-pad" maxLength={2} editable={!saving}
                                                    onChangeText={weeks => changePhase(index, { weeks })} />
                                            </View>
                                            <Pressable accessibilityRole="button" disabled={saving} style={styles.summaryRow}
                                                onPress={() => { Keyboard.dismiss(); setPickerPhase(index); }}>
                                                <View style={styles.summaryText}>
                                                    <Text style={styles.linkText}>{phase.exerciseIds.length ? "Oefeningen aanpassen" : "Oefeningen kiezen"}</Text>
                                                    {phase.exerciseIds.length > 0 && (
                                                        <Text style={styles.muted} numberOfLines={1}>
                                                            {phase.exerciseIds.map(id => exercisesById.get(id)?.title ?? "Oefening niet beschikbaar").join(", ")}
                                                        </Text>
                                                    )}
                                                </View>
                                                <Ionicons name="chevron-forward" size={18} color={COLORS.accent} />
                                            </Pressable>
                                            {draft.phases.length > 1 && (
                                                <Pressable accessibilityRole="button" disabled={saving} style={styles.summaryRow}
                                                    onPress={() => {
                                                        setDraft({ ...draft, phases: draft.phases.filter((_, position) => position !== index) });
                                                        setExpandedPhase(null);
                                                    }}>
                                                    <Text style={styles.muted}>Trainingsdoel verwijderen</Text>
                                                </Pressable>
                                            )}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                        <Button disabled={saving || draft.phases.length >= 27} onPress={() => {
                            setExpandedPhase(draft.phases.length);
                            setDraft({ ...draft, phases: [...draft.phases, emptyPhase()] });
                        }}>+ Trainingsdoel toevoegen</Button>
                    </View>
                )}
                {!draft && !!error && <Text accessibilityLiveRegion="polite" style={styles.text}>{error}</Text>}
                {!draft && plans.length === 0 && <Text style={styles.muted}>Voor dit team is er nog geen trainingsplan.</Text>}
                {!draft && plans.map(plan => {
                    let firstWeek = 1;
                    const expanded = expandedPlan === plan.id;
                    return (
                        <View key={plan.id} style={styles.card}>
                            <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={styles.summaryRow}
                                onPress={() => {
                                    setExpandedPlan(expanded ? null : plan.id);
                                    setConfirmDelete(null);
                                }}>
                                <View style={styles.summaryText}>
                                    <Text style={styles.heading}>{planLabel(plan.months)}</Text>
                                    <Text style={styles.muted}>{planDateLabel(plan.starts_on)} t/m {planDateLabel(planDateAfterDays(plan.ends_before, -1))}</Text>
                                    <Text style={styles.muted}>{plan.phases.length} {plan.phases.length === 1 ? "trainingsdoel" : "trainingsdoelen"}</Text>
                                </View>
                                <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.mutedText} />
                            </Pressable>
                            {expanded && plan.phases.map((phase, index) => {
                                const week = firstWeek;
                                firstWeek += phase.weeks;
                                return (
                                    <View key={index} style={styles.phase}>
                                        <Text style={styles.muted}>{phase.weeks === 1 ? `Week ${week}` : `Week ${week} t/m ${firstWeek - 1}`}</Text>
                                        <Text style={styles.heading}>{phase.goal}</Text>
                                        {phase.exerciseIds.map(id => <Text key={id} style={styles.text}>{exercisesById.get(id)?.title ?? "Oefening niet beschikbaar"}</Text>)}
                                    </View>
                                );
                            })}
                            {expanded && canManage && (
                                <View style={styles.row}>
                                    {confirmDelete === plan.id ? (
                                        <>
                                            <Button disabled={saving} onPress={() => remove(plan.id)}>Plan definitief verwijderen</Button>
                                            <Button disabled={saving} onPress={() => setConfirmDelete(null)}>Annuleren</Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button disabled={saving} onPress={() => openDraft(plan)}>Bewerken</Button>
                                            <Button disabled={saving} onPress={() => { setError(""); setConfirmDelete(plan.id); }}>Verwijderen</Button>
                                        </>
                                    )}
                                </View>
                            )}
                        </View>
                    );
                })}
            </ScrollView>
            {draft && canManage && (
                <View style={styles.footer}>
                    <View style={styles.footerContent}>
                        {!!error && <Text accessibilityLiveRegion="polite" style={styles.text}>{error}</Text>}
                        <View style={styles.footerActions}>
                            <Button disabled={saving} onPress={() => { setDraft(null); setError(""); }}>Annuleren</Button>
                            <Button selected disabled={saving} onPress={save}>{saving ? "Opslaan…" : "Opslaan en inplannen"}</Button>
                        </View>
                    </View>
                </View>
            )}
            {pickerPhase !== null && pickedPhase && (
                <ExercisePicker subtitle={pickedPhase.goal.trim() || `Trainingsdoel ${pickerPhase + 1}`}
                    exercises={exercises} categories={categories}
                    multiple={{
                        selected: pickedPhase.exerciseIds.map(id => exercisesById.get(id) ?? {
                            id, title: "Oefening niet beschikbaar", category_slug: "", image_url: null,
                        }),
                        limit: exerciseLimit,
                    }}
                    onSelect={({ id }) => {
                        const ids = pickedPhase.exerciseIds;
                        if (ids.includes(id)) {
                            changePhase(pickerPhase, { exerciseIds: ids.filter(item => item !== id) });
                        } else if (ids.length < exerciseLimit) {
                            changePhase(pickerPhase, { exerciseIds: [...ids, id] });
                        }
                    }}
                    onClose={() => setPickerPhase(null)} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { width: "100%", maxWidth: 820, alignSelf: "center", padding: SPACING.md, paddingBottom: SPACING.xxl, gap: SPACING.md },
    card: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.sm },
    screen: { flex: 1 },
    phase: { borderTopColor: COLORS.border, borderTopWidth: 1, paddingTop: SPACING.xs, gap: SPACING.xs },
    phaseFields: { gap: SPACING.xs, paddingBottom: SPACING.xs },
    summaryRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, minHeight: 44 },
    summaryText: { flex: 1, minWidth: 0 },
    itemTitle: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
    linkText: { color: COLORS.accent, fontSize: 15, fontWeight: "700" },
    dateRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
    dateField: { flex: 1, minWidth: 125, gap: SPACING.xs },
    endDate: { color: COLORS.text, fontSize: 15, paddingVertical: SPACING.sm },
    weekInput: { width: 64, textAlign: "center" },
    footer: { borderTopColor: COLORS.border, borderTopWidth: 1, backgroundColor: COLORS.surface },
    footerContent: { width: "100%", maxWidth: 820, alignSelf: "center", paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, gap: SPACING.xs },
    footerActions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: SPACING.sm },
    title: { color: COLORS.text, fontSize: 24, fontWeight: "900" },
    heading: { color: COLORS.text, fontSize: 17, fontWeight: "800" },
    text: { color: COLORS.text, fontSize: 15 },
    muted: { color: COLORS.mutedText, fontSize: 14 },
    row: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
    input: { color: COLORS.text, backgroundColor: COLORS.surfaceLight, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.md, minHeight: 46, padding: SPACING.sm },
    button: { backgroundColor: COLORS.surfaceLight, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, minHeight: 44, justifyContent: "center" },
    selected: { backgroundColor: COLORS.primary },
    disabled: { opacity: 0.55 },
    buttonText: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
});
