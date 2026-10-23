// Temporary hand-off when the drawing screen closes back to the training builder.
let pending: { blockId: string; conceptId: string } | null = null;

export function setCreatedTrainerExercise(blockId: string, conceptId: string) {
    pending = { blockId, conceptId };
}

export function takeCreatedTrainerExercise() {
    const value = pending;
    pending = null;
    return value;
}
