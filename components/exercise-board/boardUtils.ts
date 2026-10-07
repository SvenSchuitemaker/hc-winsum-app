import type {
    AttackerCircleCount,
    BoardItem,
    ConeLineCount,
    ConeSquareSpacing,
    ExerciseBoardLayout,
    HatColor,
    LineConstraintMode,
    PlaceableToolType
} from "./boardTypes";

export function makeId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function sanitizeItem(item: BoardItem): BoardItem {
    if (item.type === "hat") {
        return {
            ...item,
            color: item.color ?? "yellow",
        };
    }

    if (item.type === "goal") {
        return {
            ...item,
            rotation: item.rotation ?? 0,
        };
    }

    if (item.type === "runLine") {
        return {
            ...item,
            lineStyle: item.lineStyle ?? "straight",
        };
    }

    if (item.type === "passLine") {
        return {
            ...item,
            lineStyle: item.lineStyle ?? "straight",
        };
    }

    return item;
}

export function sanitizeLayout(value?: ExerciseBoardLayout | null): ExerciseBoardLayout {
    return {
        fieldMode: "half",
        items: Array.isArray(value?.items) ? value.items.map(sanitizeItem) : [],
    };
}

export function toBoardCoords(
    locationX: number,
    locationY: number,
    boardWidth: number,
    boardHeight: number
) {
    return {
        x: clamp(locationX / Math.max(boardWidth, 1), 0.02, 0.98),
        y: clamp(locationY / Math.max(boardHeight, 1), 0.02, 0.98),
    };
}

export function applyLineConstraint(
    start: { x: number; y: number },
    end: { x: number; y: number },
    mode: LineConstraintMode
) {
    if (mode === "free") {
        return end;
    }

    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);

    if (dx >= dy) {
        return {
            x: end.x,
            y: start.y,
        };
    }

    return {
        x: start.x,
        y: end.y,
    };
}

export function offsetParallelLine(params: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    offset: number;
}) {
    const dx = params.x2 - params.x1;
    const dy = params.y2 - params.y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const px = -dy / len;
    const py = dx / len;

    return {
        x1: clamp(params.x1 + px * params.offset, 0.02, 0.98),
        y1: clamp(params.y1 + py * params.offset, 0.02, 0.98),
        x2: clamp(params.x2 + px * params.offset, 0.02, 0.98),
        y2: clamp(params.y2 + py * params.offset, 0.02, 0.98),
    };
}

export function createNewItem(
    type: PlaceableToolType,
    x: number,
    y: number,
    hatColor: HatColor,
    goalRotation: number
): BoardItem {
    if (type === "runLine") {
        return {
            id: makeId(),
            type: "runLine",
            x,
            y,
            x2: x,
            y2: y,
            lineStyle: "straight",
        };
    }

    if (type === "zigzagRunLine") {
        return {
            id: makeId(),
            type: "runLine",
            x,
            y,
            x2: x,
            y2: y,
            lineStyle: "zigzag",
        };
    }

    if (type === "bounceRunLine") {
        return {
            id: makeId(),
            type: "runLine",
            x,
            y,
            x2: x,
            y2: y,
            lineStyle: "bounce",
        };
    }

    if (type === "passeerRunLine") {
        return {
            id: makeId(),
            type: "runLine",
            x,
            y,
            x2: x,
            y2: y,
            lineStyle: "passeer",
        };
    }

    if (type === "passLine") {
        return {
            id: makeId(),
            type: "passLine",
            x,
            y,
            x2: x,
            y2: y,
            lineStyle: "straight",
        };
    }

    if (type === "arcPassLine") {
        return {
            id: makeId(),
            type: "passLine",
            x,
            y,
            x2: x,
            y2: y,
            lineStyle: "arc",
        };
    }

    if (type === "guideLine") {
        return {
            id: makeId(),
            type: "guideLine",
            x,
            y,
            x2: x,
            y2: y,
        };
    }

    if (type === "hat") {
        return {
            id: makeId(),
            type: "hat",
            x,
            y,
            color: hatColor,
        };
    }

    if (type === "goal") {
        return {
            id: makeId(),
            type: "goal",
            x,
            y,
            rotation: goalRotation,
        };
    }

    if (type === "trainer") {
        return {
            id: makeId(),
            type: "trainer",
            x,
            y,
        };
    }

    if (type === "ball") {
        return {
            id: makeId(),
            type: "ball",
            x,
            y,
        };
    }

    if (type === "attacker") {
        return {
            id: makeId(),
            type: "attacker",
            x,
            y,
        };
    }

    if (type === "defender") {
        return {
            id: makeId(),
            type: "defender",
            x,
            y,
        };
    }

    return {
        id: makeId(),
        type: "cone",
        x,
        y,
    };
}

export function createConeSquareItems(
    centerX: number,
    centerY: number,
    spacing: ConeSquareSpacing
): BoardItem[] {
    const half = spacing / 2;

    return [
        { id: makeId(), type: "cone", x: clamp(centerX - half, 0.02, 0.98), y: clamp(centerY - half, 0.02, 0.98) },
        { id: makeId(), type: "cone", x: clamp(centerX + half, 0.02, 0.98), y: clamp(centerY - half, 0.02, 0.98) },
        { id: makeId(), type: "cone", x: clamp(centerX - half, 0.02, 0.98), y: clamp(centerY + half, 0.02, 0.98) },
        { id: makeId(), type: "cone", x: clamp(centerX + half, 0.02, 0.98), y: clamp(centerY + half, 0.02, 0.98) },
    ];
}

export function createAttackerCircleItems(
    centerX: number,
    centerY: number,
    count: AttackerCircleCount
): BoardItem[] {
    const radiusByCount: Record<AttackerCircleCount, number> = {
        4: 0.09,
        6: 0.12,
        8: 0.15,
    };

    const radius = radiusByCount[count];

    return Array.from({ length: count }).map((_, index) => {
        const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
        return {
            id: makeId(),
            type: "attacker" as const,
            x: clamp(centerX + Math.cos(angle) * radius, 0.02, 0.98),
            y: clamp(centerY + Math.sin(angle) * radius, 0.02, 0.98),
        };
    });
}

export function getHitRadiusByType(type: BoardItem["type"]) {
    if (type === "goal") return 0.06;
    return 0.05;
}

export function findTouchedItemId(
    items: BoardItem[],
    locationX: number,
    locationY: number,
    boardWidth: number,
    boardHeight: number
) {
    const { x, y } = toBoardCoords(locationX, locationY, boardWidth, boardHeight);

    for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];

        if (item.type === "runLine" || item.type === "passLine" || item.type === "guideLine") {
            continue;
        }

        const radius = getHitRadiusByType(item.type);
        const dx = item.x - x;
        const dy = item.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= radius) {
            return item.id;
        }
    }

    return null;
}

export function buildItemLabels(items: BoardItem[]) {
    const labels: Record<string, string> = {};
    let attackerCount = 0;
    let defenderCount = 0;

    for (const item of items) {
        if (item.type === "attacker") {
            attackerCount += 1;
            labels[item.id] = `A${attackerCount}`;
        }

        if (item.type === "defender") {
            defenderCount += 1;
            labels[item.id] = `D${defenderCount}`;
        }

        if (item.type === "trainer") {
            labels[item.id] = "T";
        }
    }

    return labels;
}

export function createConeLineItemsFromDrag(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    count: ConeLineCount
): BoardItem[] {
    if (count <= 1) {
        return [
            {
                id: makeId(),
                type: "cone",
                x: clamp(startX, 0.02, 0.98),
                y: clamp(startY, 0.02, 0.98),
            },
        ];
    }

    return Array.from({ length: count }).map((_, index) => {
        const t = index / (count - 1);

        return {
            id: makeId(),
            type: "cone" as const,
            x: clamp(startX + (endX - startX) * t, 0.02, 0.98),
            y: clamp(startY + (endY - startY) * t, 0.02, 0.98),
        };
    });
}