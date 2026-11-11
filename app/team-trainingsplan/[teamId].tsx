import { useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import {
    planDateAfterDays, planDateLabel, planDayCount, planEnd,
    type TeamTrainingPlan, type TrainingPhase,
} from "../../lib/teamTrainingPlans";

type Exercise = { id: number; title: string };
type PlanDraft = {
    id?: number;
    start: string;
    months: 3 | 6;
    phases: { goal: string; weeks: string; exerciseIds: number[] }[];
};

const emptyPhase = () => ({ goal: "", weeks: "1", exerciseIds: [] });
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
    const [draft, setDraft] = useState<PlanDraft | null>(null);
    const [pickerPhase, setPickerPhase] = useState<number | null>(null);
    const [query, setQuery] = useState("");
    const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        const client = supabase;
        if (!client || !user || !/^\d+$/.test(teamId ?? "")) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError("");
        setDraft(null);
        setConfirmDelete(null);

        async function load() {
            if (!client) return;
            try {
                const [team, result] = await Promise.all([
                    client.from("teams").select("name").eq("id", Number(teamId)).single(),
                    client.from("team_training_plans").select("id, starts_on, ends_before, months, phases")
                        .eq("team_id", Number(teamId)).order("starts_on", { ascending: false }).order("id"),
                ]);
                if (team.error || result.error) throw team.error || result.error;

                const catalog: Exercise[] = [];
                for (let offset = 0; active; offset += 500) {
                    const page = await client.from("exercises").select("id, title")
                        .order("title").order("id").range(offset, offset + 499);
                    if (page.error) throw page.error;
                    catalog.push(...page.data);
                    if (page.data.length < 500) break;
                }
                if (!active) return;
                setTeamName(team.data.name);
                setPlans(result.data as TeamTrainingPlan[]);
                setExercises(catalog);
            } catch {
                if (active) setLoadError("Trainingsplannen konden niet worden geladen.");
            } finally {
                if (active) setLoading(false);
            }
        }
        void load();
        return () => { active = false; };
    }, [teamId, user]);

    const exerciseTitles = new Map(exercises.map(exercise => [exercise.id, exercise.title]));
    const start = draft?.start.split("-").reverse().join("-") ?? "";
    const end = draft ? planEnd(start, draft.months) : null;
    const maxWeeks = end ? Math.ceil(planDayCount(start, end) / 7) : 0;
    const usedWeeks = draft?.phases.reduce((total, phase) => total + (Number(phase.weeks) || 0), 0) ?? 0;

    function openDraft(plan?: TeamTrainingPlan) {
        const now = new Date();
        const today = [String(now.getDate()).padStart(2, "0"), String(now.getMonth() + 1).padStart(2, "0"), now.getFullYear()].join("-");
        setDraft(plan ? {
            id: plan.id,
            start: planDateLabel(plan.starts_on),
            months: plan.months,
            phases: plan.phases.map(phase => ({ ...phase, weeks: String(phase.weeks) })),
        } : { start: today, months: 3, phases: [emptyPhase()] });
        setPickerPhase(null);
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
        if (draft.phases.some(phase => !phase.goal.trim() || !/^[1-9][0-9]*$/.test(phase.weeks))
            || usedWeeks > maxWeeks) {
            setError(`Vul per trainingsdoel een doel en een positief aantal weken in. Er passen maximaal ${maxWeeks} weken in dit plan.`);
            return;
        }

        const phases: TrainingPhase[] = draft.phases.map(phase => ({
            goal: phase.goal.trim(), weeks: Number(phase.weeks), exerciseIds: phase.exerciseIds,
        }));
        const values = { starts_on: start, months: draft.months, phases };
        setSaving(true);
        setError("");
        try {
            const table = supabase.from("team_training_plans");
            const request = draft.id
                ? table.update(values).eq("team_id", Number(teamId)).eq("id", draft.id)
                : table.insert({ ...values, team_id: Number(teamId) });
            const result = await request.select("id, starts_on, ends_before, months, phases").single();
            if (result.error) throw result.error;
            const saved = result.data as TeamTrainingPlan;
            setPlans(current => [...current.filter(plan => plan.id !== saved.id), saved]
                .sort((a, b) => b.starts_on.localeCompare(a.starts_on) || a.id - b.id));
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

    return (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{teamName}</Text>
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
                    <Text style={styles.text}>Startdatum (dd-mm-jjjj)</Text>
                    <TextInput accessibilityLabel="Startdatum (dd-mm-jjjj)" style={styles.input}
                        value={draft.start} maxLength={10} editable={!saving}
                        onChangeText={value => setDraft({ ...draft, start: value })} />
                    {end && <Text style={styles.muted}>Tot en met {planDateLabel(planDateAfterDays(end, -1))} · {usedWeeks} / {maxWeeks} weken ingepland</Text>}
                    {draft.phases.map((phase, index) => (
                        <View key={index} style={styles.phase}>
                            <Text style={styles.heading}>Trainingsdoel {index + 1}</Text>
                            <TextInput accessibilityLabel={`Trainingsdoel ${index + 1}`} style={styles.input}
                                placeholder="Bijvoorbeeld aannemen onder druk" placeholderTextColor={COLORS.mutedText}
                                value={phase.goal} maxLength={300} editable={!saving}
                                onChangeText={goal => changePhase(index, { goal })} />
                            <Text style={styles.text}>Aantal weken herhalen</Text>
                            <TextInput accessibilityLabel={`Aantal weken voor trainingsdoel ${index + 1}`}
                                style={styles.input} value={phase.weeks} keyboardType="number-pad" maxLength={2}
                                editable={!saving} onChangeText={weeks => changePhase(index, { weeks })} />
                            {phase.exerciseIds.map(id => (
                                <Button key={id} disabled={saving} onPress={() => changePhase(index, {
                                    exerciseIds: phase.exerciseIds.filter(item => item !== id),
                                })}>{exerciseTitles.get(id) ?? "Oefening niet beschikbaar"} · Verwijder</Button>
                            ))}
                            <Button disabled={saving} onPress={() => {
                                setQuery("");
                                setPickerPhase(pickerPhase === index ? null : index);
                            }}>{pickerPhase === index ? "Zoeken sluiten" : "Oefeningen kiezen"}</Button>
                            {pickerPhase === index && (
                                <>
                                    <TextInput accessibilityLabel="Zoek een oefening" style={styles.input}
                                        placeholder="Zoek een oefening" placeholderTextColor={COLORS.mutedText}
                                        value={query} editable={!saving} onChangeText={setQuery} />
                                    {exercises.filter(item => !phase.exerciseIds.includes(item.id)
                                        && item.title.toLowerCase().includes(query.trim().toLowerCase()))
                                        .slice(0, 12).map(item => (
                                            <Button key={item.id} disabled={saving || phase.exerciseIds.length >= 50}
                                                onPress={() => changePhase(index, {
                                                    exerciseIds: [...phase.exerciseIds, item.id],
                                                })}>+ {item.title}</Button>
                                        ))}
                                </>
                            )}
                            {draft.phases.length > 1 && (
                                <Button disabled={saving} onPress={() => {
                                    setPickerPhase(null);
                                    setDraft({ ...draft, phases: draft.phases.filter((_, position) => position !== index) });
                                }}>Trainingsdoel verwijderen</Button>
                            )}
                        </View>
                    ))}
                    <Button disabled={saving || draft.phases.length >= 27}
                        onPress={() => setDraft({ ...draft, phases: [...draft.phases, emptyPhase()] })}>Trainingsdoel toevoegen</Button>
                    <View style={styles.row}>
                        <Button selected disabled={saving} onPress={save}>{saving ? "Opslaan…" : "Opslaan"}</Button>
                        <Button disabled={saving} onPress={() => { setDraft(null); setError(""); }}>Annuleren</Button>
                    </View>
                    {!!error && <Text accessibilityLiveRegion="polite" style={styles.text}>{error}</Text>}
                </View>
            )}
            {!draft && !!error && <Text accessibilityLiveRegion="polite" style={styles.text}>{error}</Text>}
            {!draft && plans.length === 0 && <Text style={styles.muted}>Voor dit team is er nog geen trainingsplan.</Text>}
            {!draft && plans.map(plan => {
                let firstWeek = 1;
                return (
                    <View key={plan.id} style={styles.card}>
                        <Text style={styles.heading}>{planLabel(plan.months)}</Text>
                        <Text style={styles.muted}>{planDateLabel(plan.starts_on)} t/m {planDateLabel(planDateAfterDays(plan.ends_before, -1))}</Text>
                        {plan.phases.map((phase, index) => {
                            const week = firstWeek;
                            firstWeek += phase.weeks;
                            return (
                                <View key={index} style={styles.phase}>
                                    <Text style={styles.muted}>{phase.weeks === 1 ? `Week ${week}` : `Week ${week} t/m ${firstWeek - 1}`}</Text>
                                    <Text style={styles.heading}>{phase.goal}</Text>
                                    {phase.exerciseIds.map(id => <Text key={id} style={styles.text}>{exerciseTitles.get(id) ?? "Oefening niet beschikbaar"}</Text>)}
                                </View>
                            );
                        })}
                        {canManage && (
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
    );
}

const styles = StyleSheet.create({
    container: { width: "100%", maxWidth: 820, alignSelf: "center", padding: SPACING.md, paddingBottom: SPACING.xxl, gap: SPACING.md },
    card: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.sm },
    phase: { borderTopColor: COLORS.border, borderTopWidth: 1, paddingTop: SPACING.md, marginTop: SPACING.sm, gap: SPACING.sm },
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
