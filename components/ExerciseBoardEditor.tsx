import Ionicons from "@expo/vector-icons/Ionicons";
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    LayoutChangeEvent,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import ExerciseBoardCanvas from "./exercise-board/ExerciseBoardCanvas";
import {
    type AttackerCircleCount,
    type AttackerCircleCountOption,
    type ConeLineCount,
    type ConeLineCountOption,
    type ConeSquareSpacing,
    type ConeSquareSpacingOption,
    type ExerciseBoardEditorProps,
    type ExerciseBoardEditorRef,
    type FieldMode,
    type GoalRotationOption,
    type HatColor,
    type HatColorOption,
    type LineConstraintMode,
    type LineConstraintOption,
    type ToolOption,
    type ToolType,
} from "./exercise-board/boardTypes";
import { buildItemLabels, clamp, sanitizeLayout } from "./exercise-board/boardUtils";
import {
    ATTACKER_CIRCLE_COUNT_OPTIONS,
    CONE_LINE_COUNT_OPTIONS,
    CONE_SQUARE_SPACING_OPTIONS,
    GOAL_ROTATION_OPTIONS,
    HAT_COLOR_OPTIONS,
    LINE_CONSTRAINT_OPTIONS,
    TOOLS,
} from "./exercise-board/toolDefinitions";
import { useBoardPanResponder } from "./exercise-board/useBoardPanResponder";

export default forwardRef<ExerciseBoardEditorRef, ExerciseBoardEditorProps>(
    function ExerciseBoardEditor({ value, onChange }, ref) {
        const initialLayoutRef = useRef(sanitizeLayout(value));
        const hydratedFromPropsRef = useRef(false);
        const captureTargetRef = useRef<View | null>(null);

        const [fieldMode] = useState<FieldMode>(initialLayoutRef.current.fieldMode);
        const [fieldOrientation, setFieldOrientation] = useState<"top" | "right">(initialLayoutRef.current.fieldOrientation === "top" ? "top" : "right");
        const [items, setItems] = useState(initialLayoutRef.current.items);
        const [backgroundImageUrl, setBackgroundImageUrl] = useState(initialLayoutRef.current.backgroundImageUrl);
        const [backgroundOpacity, setBackgroundOpacity] = useState(initialLayoutRef.current.backgroundOpacity ?? 0.65);
        const [backgroundCalibration, setBackgroundCalibration] = useState(initialLayoutRef.current.backgroundCalibration);
        const [showBackground, setShowBackground] = useState(false);
        const [selectedTool, setSelectedTool] = useState<ToolType>("select");
        const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
        const [boardSize, setBoardSize] = useState({ width: 1, height: 1 });
        const [selectedHatColor, setSelectedHatColor] = useState<HatColor>("yellow");
        const [selectedGoalRotation, setSelectedGoalRotation] = useState<number>(0);
        const [lineConstraintMode, setLineConstraintMode] = useState<LineConstraintMode>("free");
        const [coneSquareSpacing, setConeSquareSpacing] = useState<ConeSquareSpacing>(0.12);
        const [coneLineCount, setConeLineCount] = useState<ConeLineCount>(3);
        const [attackerCircleCount, setAttackerCircleCount] = useState<AttackerCircleCount>(4);

        const drawingItemIdRef = useRef<string | null>(null);
        const drawingStartRef = useRef<{ x: number; y: number } | null>(null);
        const linePairIdsRef = useRef<{ primaryId: string; secondaryId: string } | null>(null);

        const isSelectMode = selectedTool === "select";
        const isLineTool =
            selectedTool === "runLine" ||
            selectedTool === "zigzagRunLine" ||
            selectedTool === "bounceRunLine" ||
            selectedTool === "passeerRunLine" ||
            selectedTool === "passLine" ||
            selectedTool === "arcPassLine" ||
            selectedTool === "guideLine" ||
            selectedTool === "coneLine";
        const isRunPassPairTool = selectedTool === "runPassPair";
        const isPassReturnPairTool = selectedTool === "passReturnPair";
        const isConeSquareTool = selectedTool === "coneSquare";
        const isConeLineTool = selectedTool === "coneLine";
        const isAttackerCircleTool = selectedTool === "attackerCircle";

        useImperativeHandle(ref, () => ({
            clearSelection() {
                setSelectedItemId(null);
            },
            getCaptureTarget() {
                return captureTargetRef.current;
            },
        }));

        useEffect(() => {
            if (hydratedFromPropsRef.current) return;
            if (!value) return;

            const next = sanitizeLayout(value);
            setItems(next.items);
            setBackgroundImageUrl(next.backgroundImageUrl);
            setFieldOrientation(next.fieldOrientation === "top" ? "top" : "right");
            setBackgroundOpacity(next.backgroundOpacity ?? 0.65);
            setBackgroundCalibration(next.backgroundCalibration);
            hydratedFromPropsRef.current = true;
        }, [value]);

        useEffect(() => {
            onChange?.({ fieldMode, fieldOrientation, items, backgroundImageUrl, backgroundOpacity, backgroundCalibration });
        }, [fieldMode, fieldOrientation, items, backgroundImageUrl, backgroundOpacity, backgroundCalibration, onChange]);

        const itemLabels = useMemo(() => buildItemLabels(items), [items]);

        function updateItem(id: string, updates: Record<string, any>) {
            setItems((current) =>
                current.map((item) => (item.id === id ? { ...item, ...updates } : item))
            );
        }

        const boardPanResponder = useBoardPanResponder({
            isSelectMode,
            isLineTool,
            isRunPassPairTool,
            isPassReturnPairTool,
            isConeSquareTool,
            isConeLineTool,
            isAttackerCircleTool,
            items,
            boardWidth: boardSize.width,
            boardHeight: boardSize.height,
            selectedTool,
            selectedHatColor,
            selectedGoalRotation,
            lineConstraintMode,
            coneSquareSpacing,
            coneLineCount,
            coneLineDirection: "horizontal",
            attackerCircleCount,
            drawingItemIdRef,
            drawingStartRef,
            linePairIdsRef,
            setItems,
            setSelectedItemId,
        });

        function handleBoardLayout(event: LayoutChangeEvent) {
            const { width, height } = event.nativeEvent.layout;
            setBoardSize({ width, height });
        }

        const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
        const lineItems = items.filter(
            (item) =>
                item.type === "runLine" ||
                item.type === "passLine" ||
                item.type === "guideLine"
        );
        const nonLineItems = items.filter(
            (item) =>
                item.type !== "runLine" &&
                item.type !== "passLine" &&
                item.type !== "guideLine"
        );

        return (
            <View style={styles.container}>
                <View style={styles.card}>
                    <Text style={styles.title}>Teken de oefening</Text>
                    <Text style={styles.text}>
                        Kies Select om een item te selecteren. Gebruik de knoppen onder Bewerken om
                        het geselecteerde item te verplaatsen. Sleep bij lijnen om de richting uit te
                        tekenen.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Tools</Text>
                    <View style={styles.toolsGrid}>
                        {TOOLS.map((tool: ToolOption) => {
                            const active = selectedTool === tool.type;

                            return (
                                <Pressable
                                    key={tool.type}
                                    onPress={() => setSelectedTool(tool.type)}
                                    style={[styles.toolButton, active && styles.toolButtonActive]}
                                >
                                    <Ionicons
                                        name={tool.icon}
                                        size={20}
                                        color={active ? COLORS.text : COLORS.primaryLight}
                                    />
                                    <Text style={[styles.toolText, active && styles.toolTextActive]}>
                                        {tool.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    {selectedTool === "hat" && (
                        <>
                            <Text style={styles.optionTitle}>Kleur hoedje</Text>
                            <View style={styles.colorGrid}>
                                {HAT_COLOR_OPTIONS.map((option: HatColorOption) => {
                                    const active = selectedHatColor === option.value;

                                    return (
                                        <Pressable
                                            key={option.value}
                                            onPress={() => setSelectedHatColor(option.value)}
                                            style={[styles.colorButton, active && styles.colorButtonActive]}
                                        >
                                            <View
                                                style={[
                                                    styles.colorDot,
                                                    {
                                                        backgroundColor: option.fill,
                                                        borderColor: option.border,
                                                    },
                                                ]}
                                            />
                                            <Text style={[styles.colorLabel, active && styles.colorLabelActive]}>
                                                {option.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    {selectedTool === "goal" && (
                        <>
                            <Text style={styles.optionTitle}>Richting goal</Text>
                            <View style={styles.optionGrid}>
                                {GOAL_ROTATION_OPTIONS.map((option: GoalRotationOption) => {
                                    const active = selectedGoalRotation === option.value;

                                    return (
                                        <Pressable
                                            key={`tool-goal-${option.value}`}
                                            onPress={() => setSelectedGoalRotation(option.value)}
                                            style={[styles.optionButton, active && styles.optionButtonActive]}
                                        >
                                            <Text
                                                style={[
                                                    styles.optionButtonText,
                                                    active && styles.optionButtonTextActive,
                                                ]}
                                            >
                                                {option.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    {(isLineTool || isRunPassPairTool || isPassReturnPairTool) && (
                        <>
                            <Text style={styles.optionTitle}>Lijnmodus</Text>
                            <View style={styles.optionGrid}>
                                {LINE_CONSTRAINT_OPTIONS.map((option: LineConstraintOption) => {
                                    const active = lineConstraintMode === option.value;

                                    return (
                                        <Pressable
                                            key={`line-mode-${option.value}`}
                                            onPress={() => setLineConstraintMode(option.value)}
                                            style={[styles.optionButton, active && styles.optionButtonActive]}
                                        >
                                            <Text
                                                style={[
                                                    styles.optionButtonText,
                                                    active && styles.optionButtonTextActive,
                                                ]}
                                            >
                                                {option.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    {isConeSquareTool && (
                        <>
                            <Text style={styles.optionTitle}>Afstand tussen pylonen</Text>
                            <View style={styles.optionGrid}>
                                {CONE_SQUARE_SPACING_OPTIONS.map((option: ConeSquareSpacingOption) => {
                                    const active = coneSquareSpacing === option.value;

                                    return (
                                        <Pressable
                                            key={`cone-square-spacing-${option.value}`}
                                            onPress={() => setConeSquareSpacing(option.value)}
                                            style={[styles.optionButton, active && styles.optionButtonActive]}
                                        >
                                            <Text
                                                style={[
                                                    styles.optionButtonText,
                                                    active && styles.optionButtonTextActive,
                                                ]}
                                            >
                                                {option.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                            <Text style={styles.helperText}>
                                Tik op het veld om 4 pylonen als vierkant te plaatsen.
                            </Text>
                        </>
                    )}

                    {isConeLineTool && (
                        <>
                            <Text style={styles.optionTitle}>Aantal pylonen</Text>
                            <View style={styles.optionGrid}>
                                {CONE_LINE_COUNT_OPTIONS.map((option: ConeLineCountOption) => {
                                    const active = coneLineCount === option.value;

                                    return (
                                        <Pressable
                                            key={`cone-line-count-${option.value}`}
                                            onPress={() => setConeLineCount(option.value)}
                                            style={[styles.optionButton, active && styles.optionButtonActive]}
                                        >
                                            <Text
                                                style={[
                                                    styles.optionButtonText,
                                                    active && styles.optionButtonTextActive,
                                                ]}
                                            >
                                                {option.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            <Text style={styles.helperText}>
                                Sleep op het veld om een lijn van pylonen te plaatsen.
                            </Text>
                        </>
                    )}

                    {isAttackerCircleTool && (
                        <>
                            <Text style={styles.optionTitle}>Aantal A&apos;s in de cirkel</Text>
                            <View style={styles.optionGrid}>
                                {ATTACKER_CIRCLE_COUNT_OPTIONS.map((option: AttackerCircleCountOption) => {
                                    const active = attackerCircleCount === option.value;

                                    return (
                                        <Pressable
                                            key={`attacker-circle-count-${option.value}`}
                                            onPress={() => setAttackerCircleCount(option.value)}
                                            style={[styles.optionButton, active && styles.optionButtonActive]}
                                        >
                                            <Text
                                                style={[
                                                    styles.optionButtonText,
                                                    active && styles.optionButtonTextActive,
                                                ]}
                                            >
                                                {option.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                            <Text style={styles.helperText}>
                                Tik op het veld om A&apos;s in een cirkel te plaatsen.
                            </Text>
                        </>
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Preview</Text>
                    <Text style={styles.helperText}>
                        Geselecteerde tool:{" "}
                        {TOOLS.find((tool: ToolOption) => tool.type === selectedTool)?.label}
                    </Text>

                    {!!backgroundImageUrl && (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12, alignItems: "center" }}>
                            <Pressable onPress={() => setShowBackground((current) => !current)} style={styles.toolButton}>
                                <Text style={styles.toolText}>{showBackground ? "Klaar met overtrekken" : "Toon foto om bij te stellen"}</Text>
                            </Pressable>
                            <Pressable onPress={() => setBackgroundOpacity((current) => Math.max(0.2, Math.round((current - 0.1) * 10) / 10))} style={styles.toolButton}>
                                <Text style={styles.toolText}>−</Text>
                            </Pressable>
                            <Text style={styles.helperText}>Foto {Math.round(backgroundOpacity * 100)}%</Text>
                            <Pressable onPress={() => setBackgroundOpacity((current) => Math.min(1, Math.round((current + 0.1) * 10) / 10))} style={styles.toolButton}>
                                <Text style={styles.toolText}>+</Text>
                            </Pressable>
                        </View>
                    )}
                    <ExerciseBoardCanvas
                        captureTargetRef={captureTargetRef}
                        boardStyle={[styles.board, styles.halfBoard]}
                        onLayout={handleBoardLayout}
                        panHandlers={boardPanResponder.panHandlers}
                        lineItems={lineItems}
                        nonLineItems={nonLineItems}
                        selectedItemId={selectedItemId}
                        isSelectMode={isSelectMode}
                        setSelectedItemId={setSelectedItemId}
                        boardWidth={boardSize.width}
                        boardHeight={boardSize.height}
                        itemLabels={itemLabels}
                        fieldOrientation={fieldOrientation}
                        backgroundImageUrl={backgroundImageUrl}
                        backgroundOpacity={backgroundOpacity}
                        backgroundCalibration={backgroundCalibration}
                        showBackground={showBackground}
                    />
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Bewerken</Text>

                    {!selectedItem ? (
                        <Text style={styles.text}>Selecteer een onderdeel om snelle acties te tonen.</Text>
                    ) : (
                        <>
                            <Text style={styles.helperText}>Geselecteerd: {selectedItem.type}</Text>

                            {selectedItem.type === "hat" && (
                                <>
                                    <Text style={styles.optionTitle}>Kleur geselecteerd hoedje</Text>
                                    <View style={styles.colorGrid}>
                                        {HAT_COLOR_OPTIONS.map((option: HatColorOption) => {
                                            const active = (selectedItem.color ?? "yellow") === option.value;

                                            return (
                                                <Pressable
                                                    key={`selected-hat-${option.value}`}
                                                    onPress={() => updateItem(selectedItem.id, { color: option.value })}
                                                    style={[styles.colorButton, active && styles.colorButtonActive]}
                                                >
                                                    <View
                                                        style={[
                                                            styles.colorDot,
                                                            {
                                                                backgroundColor: option.fill,
                                                                borderColor: option.border,
                                                            },
                                                        ]}
                                                    />
                                                    <Text style={[styles.colorLabel, active && styles.colorLabelActive]}>
                                                        {option.label}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                </>
                            )}

                            {selectedItem.type === "goal" && (
                                <>
                                    <Text style={styles.optionTitle}>Richting geselecteerde goal</Text>
                                    <View style={styles.optionGrid}>
                                        {GOAL_ROTATION_OPTIONS.map((option: GoalRotationOption) => {
                                            const active = (selectedItem.rotation ?? 0) === option.value;

                                            return (
                                                <Pressable
                                                    key={`selected-goal-${option.value}`}
                                                    onPress={() =>
                                                        updateItem(selectedItem.id, { rotation: option.value })
                                                    }
                                                    style={[styles.optionButton, active && styles.optionButtonActive]}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.optionButtonText,
                                                            active && styles.optionButtonTextActive,
                                                        ]}
                                                    >
                                                        {option.label}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                </>
                            )}

                            <View style={styles.actionRow}>
                                <Pressable
                                    style={styles.actionButton}
                                    onPress={() =>
                                        updateItem(selectedItem.id, {
                                            x: clamp(selectedItem.x - 0.03, 0.02, 0.98),
                                        })
                                    }
                                >
                                    <Ionicons name="arrow-back" size={18} color={COLORS.text} />
                                </Pressable>

                                <Pressable
                                    style={styles.actionButton}
                                    onPress={() =>
                                        updateItem(selectedItem.id, {
                                            x: clamp(selectedItem.x + 0.03, 0.02, 0.98),
                                        })
                                    }
                                >
                                    <Ionicons name="arrow-forward" size={18} color={COLORS.text} />
                                </Pressable>

                                <Pressable
                                    style={styles.actionButton}
                                    onPress={() =>
                                        updateItem(selectedItem.id, {
                                            y: clamp(selectedItem.y - 0.03, 0.02, 0.98),
                                        })
                                    }
                                >
                                    <Ionicons name="arrow-up" size={18} color={COLORS.text} />
                                </Pressable>

                                <Pressable
                                    style={styles.actionButton}
                                    onPress={() =>
                                        updateItem(selectedItem.id, {
                                            y: clamp(selectedItem.y + 0.03, 0.02, 0.98),
                                        })
                                    }
                                >
                                    <Ionicons name="arrow-down" size={18} color={COLORS.text} />
                                </Pressable>

                                {(selectedItem.type === "runLine" ||
                                    selectedItem.type === "passLine" ||
                                    selectedItem.type === "guideLine") && (
                                        <>
                                            <Pressable
                                                style={styles.actionButton}
                                                onPress={() =>
                                                    updateItem(selectedItem.id, {
                                                        x2: clamp(
                                                            (selectedItem.x2 ?? selectedItem.x) - 0.03,
                                                            0.02,
                                                            0.98
                                                        ),
                                                    })
                                                }
                                            >
                                                <Ionicons name="play-back" size={18} color={COLORS.text} />
                                            </Pressable>

                                            <Pressable
                                                style={styles.actionButton}
                                                onPress={() =>
                                                    updateItem(selectedItem.id, {
                                                        x2: clamp(
                                                            (selectedItem.x2 ?? selectedItem.x) + 0.03,
                                                            0.02,
                                                            0.98
                                                        ),
                                                    })
                                                }
                                            >
                                                <Ionicons name="play-forward" size={18} color={COLORS.text} />
                                            </Pressable>

                                            <Pressable
                                                style={styles.actionButton}
                                                onPress={() =>
                                                    updateItem(selectedItem.id, {
                                                        y2: clamp(
                                                            (selectedItem.y2 ?? selectedItem.y) - 0.03,
                                                            0.02,
                                                            0.98
                                                        ),
                                                    })
                                                }
                                            >
                                                <Ionicons name="caret-up" size={18} color={COLORS.text} />
                                            </Pressable>

                                            <Pressable
                                                style={styles.actionButton}
                                                onPress={() =>
                                                    updateItem(selectedItem.id, {
                                                        y2: clamp(
                                                            (selectedItem.y2 ?? selectedItem.y) + 0.03,
                                                            0.02,
                                                            0.98
                                                        ),
                                                    })
                                                }
                                            >
                                                <Ionicons name="caret-down" size={18} color={COLORS.text} />
                                            </Pressable>
                                        </>
                                    )}

                                <Pressable
                                    style={[styles.actionButton, styles.deleteButton]}
                                    onPress={() => {
                                        setItems((current) =>
                                            current.filter((item) => item.id !== selectedItem.id)
                                        );
                                        setSelectedItemId(null);
                                    }}
                                >
                                    <Ionicons name="trash-outline" size={18} color={COLORS.text} />
                                </Pressable>
                            </View>
                        </>
                    )}

                    <View style={styles.footerActions}>
                        <Pressable
                            style={styles.secondaryButton}
                            onPress={() => {
                                setItems([]);
                                setSelectedItemId(null);
                            }}
                        >
                            <Text style={styles.secondaryButtonText}>Leeg veld</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        );
    }
);

const styles = StyleSheet.create({
    container: {
        backgroundColor: COLORS.background,
    },
    card: {
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    title: {
        color: COLORS.text,
        fontSize: 24,
        fontWeight: "900",
        marginBottom: 8,
        textAlign: "center",
    },
    sectionTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: "800",
        marginBottom: 10,
    },
    text: {
        color: COLORS.mutedText,
        fontSize: 15,
        lineHeight: 22,
        textAlign: "center",
    },
    helperText: {
        color: COLORS.primaryLight,
        fontSize: 14,
        fontWeight: "700",
        marginBottom: SPACING.sm,
        marginTop: SPACING.sm,
    },
    toolsGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: SPACING.sm,
    },
    toolButton: {
        width: "31%",
        minWidth: 96,
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.md,
        paddingVertical: 12,
        paddingHorizontal: 8,
        alignItems: "center",
        gap: 6,
    },
    toolButtonActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primaryLight,
    },
    toolText: {
        color: COLORS.primaryLight,
        fontSize: 12,
        fontWeight: "700",
        textAlign: "center",
    },
    toolTextActive: {
        color: COLORS.text,
    },
    optionTitle: {
        color: COLORS.primaryLight,
        fontSize: 14,
        fontWeight: "700",
        marginTop: SPACING.md,
        marginBottom: SPACING.sm,
    },
    optionGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: SPACING.sm,
    },
    optionButton: {
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    optionButtonActive: {
        borderColor: COLORS.primary,
        backgroundColor: COLORS.primary + "22",
    },
    optionButtonText: {
        color: COLORS.text,
        fontSize: 12,
        fontWeight: "700",
    },
    optionButtonTextActive: {
        color: COLORS.primaryLight,
    },
    colorGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: SPACING.sm,
    },
    colorButton: {
        minWidth: 88,
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.md,
        paddingVertical: 10,
        paddingHorizontal: 10,
        alignItems: "center",
        gap: 6,
    },
    colorButtonActive: {
        borderColor: COLORS.primary,
        backgroundColor: COLORS.primary + "22",
    },
    colorDot: {
        width: 24,
        height: 24,
        borderRadius: 99,
        borderWidth: 2,
    },
    colorLabel: {
        color: COLORS.text,
        fontSize: 12,
        fontWeight: "700",
    },
    colorLabelActive: {
        color: COLORS.primaryLight,
    },
    board: {
        position: "relative",
        width: "100%",
        overflow: "hidden",
        borderRadius: RADIUS.lg,
        backgroundColor: "#4EAF00",
    },
    halfBoard: {
        aspectRatio: 1,
    },
    actionRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: SPACING.sm,
        marginTop: SPACING.sm,
    },
    actionButton: {
        width: 46,
        height: 46,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.surfaceLight,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    deleteButton: {
        backgroundColor: "#A52B45",
    },
    footerActions: {
        flexDirection: "row",
        gap: SPACING.sm,
        marginTop: SPACING.md,
    },
    secondaryButton: {
        flex: 1,
        backgroundColor: COLORS.surfaceLight,
        borderRadius: RADIUS.md,
        paddingVertical: 14,
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    secondaryButtonText: {
        color: COLORS.text,
        fontWeight: "800",
        fontSize: 15,
    },
});