export type TrainingPhase = {
    goal: string;
    weeks: number;
    exerciseIds: number[];
};

export type TeamTrainingPlan = {
    id: number;
    starts_on: string;
    ends_before: string;
    months: 3 | 6;
    phases: TrainingPhase[];
};

const dayInMs = 86_400_000;

export function planEnd(start: string, months: number) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
    const date = new Date(start + "T00:00:00Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) return null;
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const monthEnd = new Date(date);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
    date.setUTCDate(Math.min(day, monthEnd.getUTCDate()));
    const end = date.toISOString().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : null;
}

export function planDateAfterDays(start: string, days: number) {
    return new Date(Date.parse(start) + days * dayInMs).toISOString().slice(0, 10);
}

export function planDayCount(start: string, end: string) {
    return (Date.parse(end) - Date.parse(start)) / dayInMs;
}

export function planDateLabel(date: string) {
    return date.split("-").reverse().join("-");
}

export function planPhaseOn(plan: TeamTrainingPlan, date: string) {
    if (date < plan.starts_on || date >= plan.ends_before) return null;
    let week = Math.floor(planDayCount(plan.starts_on, date) / 7);
    for (const phase of plan.phases) {
        if (week < phase.weeks) return phase;
        week -= phase.weeks;
    }
    return null;
}
