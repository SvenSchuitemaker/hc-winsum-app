import type {
    AttackerCircleCountOption,
    ConeLineCountOption,
    ConeLineDirectionOption,
    ConeSquareSpacingOption,
    GoalRotationOption,
    HatColorOption,
    LineConstraintOption,
    ToolOption,
} from "./boardTypes";

export const TOOLS: ToolOption[] = [
    { type: "select", label: "Select", icon: "checkbox-outline" },
    { type: "cone", label: "Pylon", icon: "triangle-outline" },
    { type: "coneLine", label: "Lijn pylonen", icon: "remove-outline" },
    { type: "coneSquare", label: "4 pylonen", icon: "grid-outline" },
    { type: "attackerCircle", label: "A-cirkel", icon: "radio-button-on-outline" },
    { type: "hat", label: "Hoedje", icon: "ellipse-outline" },
    { type: "attacker", label: "Aanvaller", icon: "person-outline" },
    { type: "defender", label: "Verdediger", icon: "shield-outline" },
    { type: "trainer", label: "Trainer", icon: "body-outline" },
    { type: "ball", label: "Bal", icon: "football-outline" },
    { type: "goal", label: "Goal", icon: "square-outline" },
    { type: "runLine", label: "Looplijn", icon: "trending-up-outline" },
    { type: "zigzagRunLine", label: "Zigzag loop", icon: "pulse-outline" },
    { type: "bounceRunLine", label: "Stuiterbal", icon: "radio-button-off-outline" },
    { type: "passeerRunLine", label: "Passeer", icon: "git-network-outline" },
    { type: "passLine", label: "Passlijn", icon: "play-forward-outline" },
    { type: "arcPassLine", label: "Boog pass", icon: "return-up-forward-outline" },
    { type: "guideLine", label: "Stippellijn", icon: "remove-outline" },
    { type: "runPassPair", label: "Loop + pass", icon: "git-compare-outline" },
    { type: "passReturnPair", label: "Pass heen/terug", icon: "swap-horizontal-outline" },
];

export const HAT_COLOR_OPTIONS: HatColorOption[] = [
    { value: "white", label: "Wit", fill: "#FFFFFF", border: "#D7DEE8" },
    { value: "orange", label: "Oranje", fill: "#FF9F43", border: "#FF9F43" },
    { value: "yellow", label: "Geel", fill: "#FFD93D", border: "#FFD93D" },
    { value: "red", label: "Rood", fill: "#FF5A5F", border: "#FF5A5F" },
    { value: "blue", label: "Blauw", fill: "#4D96FF", border: "#4D96FF" },
    { value: "green", label: "Groen", fill: "#2ECC71", border: "#2ECC71" },
];

export const GOAL_ROTATION_OPTIONS: GoalRotationOption[] = [
    { value: 0, label: "Open boven" },
    { value: 90, label: "Open rechts" },
    { value: 180, label: "Open onder" },
    { value: 270, label: "Open links" },
];

export const LINE_CONSTRAINT_OPTIONS: LineConstraintOption[] = [
    { value: "free", label: "Vrij" },
    { value: "straight", label: "Recht H/V" },
];

export const CONE_SQUARE_SPACING_OPTIONS: ConeSquareSpacingOption[] = [
    { value: 0.08, label: "Klein" },
    { value: 0.12, label: "Normaal" },
    { value: 0.16, label: "Ruim" },
    { value: 0.2, label: "Groot" },
    { value: 0.24, label: "Extra groot" },
];

export const CONE_LINE_COUNT_OPTIONS: ConeLineCountOption[] = [
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" },
    { value: 5, label: "5" },
    { value: 6, label: "6" },
];

export const CONE_LINE_DIRECTION_OPTIONS: ConeLineDirectionOption[] = [
    { value: "horizontal", label: "Horizontaal" },
    { value: "vertical", label: "Verticaal" },
];

export const ATTACKER_CIRCLE_COUNT_OPTIONS: AttackerCircleCountOption[] = [
    { value: 4, label: "4" },
    { value: 6, label: "6" },
    { value: 8, label: "8" },
];