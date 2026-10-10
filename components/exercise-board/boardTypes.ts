import Ionicons from "@expo/vector-icons/Ionicons";
import type { View } from "react-native";

export type FieldMode = "half";

export type ToolType =
    | "select"
    | "cone"
    | "coneLine"
    | "hat"
    | "attacker"
    | "defender"
    | "trainer"
    | "ball"
    | "goal"
    | "runLine"
    | "zigzagRunLine"
    | "bounceRunLine"
    | "passeerRunLine"
    | "passLine"
    | "arcPassLine"
    | "guideLine"
    | "runPassPair"
    | "passReturnPair"
    | "coneSquare"
    | "attackerCircle";

export type RenderItemType =
    | "cone"
    | "hat"
    | "attacker"
    | "defender"
    | "trainer"
    | "ball"
    | "goal"
    | "runLine"
    | "passLine"
    | "guideLine"
    | "player"
    | "text";

export type PlaceableToolType = Exclude<
    ToolType,
    "select" | "coneSquare" | "coneLine" | "runPassPair" | "passReturnPair" | "attackerCircle"
>;

export type HatColor = "white" | "orange" | "yellow" | "red" | "blue" | "green";
export type LineConstraintMode = "free" | "straight";
export type ConeSquareSpacing = 0.08 | 0.12 | 0.16 | 0.2 | 0.24;
export type ConeLineCount = 2 | 3 | 4 | 5 | 6;
export type ConeLineDirection = "horizontal" | "vertical";
export type AttackerCircleCount = 4 | 6 | 8;
export type LineStyle = "straight" | "zigzag" | "arc" | "bounce" | "passeer";

export type BoardItem = {
    id: string;
    type: RenderItemType;
    x: number;
    y: number;
    x2?: number;
    y2?: number;
    color?: HatColor;
    rotation?: number;
    lineStyle?: LineStyle;
    shirtColor?: "black" | "orange" | "blue" | "grey" | "white" | "red" | "green";
    label?: string;
    text?: string;
    strokeColor?: string;
    dashed?: boolean;
    arrowHead?: boolean;
};

export type ExerciseBoardLayout = {
    fieldMode: FieldMode;
    fieldOrientation?: "right" | "top";
    items: BoardItem[];
    backgroundImageUrl?: string | null;
    backgroundOpacity?: number;
    backgroundCalibration?: { bounds: { left: number; top: number; right: number; bottom: number }; rotation: number; flipHorizontal: boolean };
};

export type ExerciseBoardEditorRef = {
    clearSelection: () => void;
    getCaptureTarget: () => View | null;
};

export type ToolOption = {
    type: ToolType;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
};

export type HatColorOption = {
    value: HatColor;
    label: string;
    fill: string;
    border: string;
};

export type GoalRotationOption = {
    value: number;
    label: string;
};

export type LineConstraintOption = {
    value: LineConstraintMode;
    label: string;
};

export type ConeSquareSpacingOption = {
    value: ConeSquareSpacing;
    label: string;
};

export type ConeLineCountOption = {
    value: ConeLineCount;
    label: string;
};

export type ConeLineDirectionOption = {
    value: ConeLineDirection;
    label: string;
};

export type AttackerCircleCountOption = {
    value: AttackerCircleCount;
    label: string;
};

export type ExerciseBoardEditorProps = {
    value?: ExerciseBoardLayout | null;
    onChange?: (layout: ExerciseBoardLayout) => void;
};