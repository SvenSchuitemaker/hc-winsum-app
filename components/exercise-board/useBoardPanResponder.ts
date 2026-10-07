import { PanResponder } from "react-native";
import type {
    AttackerCircleCount,
    BoardItem,
    ConeLineCount,
    ConeLineDirection,
    ConeSquareSpacing,
    HatColor,
    LineConstraintMode,
    PlaceableToolType,
    ToolType,
} from "./boardTypes";
import {
    applyLineConstraint,
    createAttackerCircleItems,
    createConeLineItemsFromDrag,
    createConeSquareItems,
    createNewItem,
    findTouchedItemId,
    makeId,
    offsetParallelLine,
    toBoardCoords,
} from "./boardUtils";

type Params = {
    isSelectMode: boolean;
    isLineTool: boolean;
    isRunPassPairTool: boolean;
    isPassReturnPairTool: boolean;
    isConeSquareTool: boolean;
    isConeLineTool: boolean;
    isAttackerCircleTool: boolean;
    items: BoardItem[];
    boardWidth: number;
    boardHeight: number;
    selectedTool: ToolType;
    selectedHatColor: HatColor;
    selectedGoalRotation: number;
    lineConstraintMode: LineConstraintMode;
    coneSquareSpacing: ConeSquareSpacing;
    coneLineCount: ConeLineCount;
    coneLineDirection: ConeLineDirection;
    attackerCircleCount: AttackerCircleCount;
    drawingItemIdRef: React.MutableRefObject<string | null>;
    drawingStartRef: React.MutableRefObject<{ x: number; y: number } | null>;
    linePairIdsRef: React.MutableRefObject<{ primaryId: string; secondaryId: string } | null>;
    setItems: React.Dispatch<React.SetStateAction<BoardItem[]>>;
    setSelectedItemId: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useBoardPanResponder(params: Params) {
    return PanResponder.create({
        onStartShouldSetPanResponder: (event) => {
            if (params.isSelectMode) {
                return false;
            }

            const touchedItemId = findTouchedItemId(
                params.items,
                event.nativeEvent.locationX,
                event.nativeEvent.locationY,
                params.boardWidth,
                params.boardHeight
            );

            if (touchedItemId !== null) {
                params.drawingStartRef.current = null;
                return false;
            }

            params.drawingStartRef.current = toBoardCoords(
                event.nativeEvent.locationX,
                event.nativeEvent.locationY,
                params.boardWidth,
                params.boardHeight
            );

            return true;
        },

        onMoveShouldSetPanResponder: (_, gesture) => {
            if (params.isSelectMode) {
                return false;
            }

            if (
                params.isLineTool ||
                params.isRunPassPairTool ||
                params.isPassReturnPairTool ||
                params.isConeLineTool
            ) {
                return Math.abs(gesture.dx) > 1 || Math.abs(gesture.dy) > 1;
            }

            return false;
        },

        onPanResponderGrant: () => {
            if (params.isSelectMode) {
                params.drawingItemIdRef.current = null;
                params.linePairIdsRef.current = null;
                return;
            }

            const start = params.drawingStartRef.current;
            if (!start) {
                params.drawingItemIdRef.current = null;
                params.linePairIdsRef.current = null;
                return;
            }

            if (params.isConeSquareTool) {
                params.setItems((current) => [
                    ...current,
                    ...createConeSquareItems(start.x, start.y, params.coneSquareSpacing),
                ]);
                params.setSelectedItemId(null);
                params.drawingItemIdRef.current = null;
                params.linePairIdsRef.current = null;
                return;
            }

            if (params.isConeLineTool) {
                params.drawingItemIdRef.current = "__cone_line_drag__";
                params.linePairIdsRef.current = null;
                params.setSelectedItemId(null);
                return;
            }

            if (params.isAttackerCircleTool) {
                params.setItems((current) => [
                    ...current,
                    ...createAttackerCircleItems(
                        start.x,
                        start.y,
                        params.attackerCircleCount
                    ),
                ]);
                params.setSelectedItemId(null);
                params.drawingItemIdRef.current = null;
                params.linePairIdsRef.current = null;
                return;
            }

            if (params.isRunPassPairTool) {
                const runItem: BoardItem = {
                    id: makeId(),
                    type: "runLine",
                    x: start.x,
                    y: start.y,
                    x2: start.x,
                    y2: start.y,
                    lineStyle: "straight",
                };

                const passItem: BoardItem = {
                    id: makeId(),
                    type: "passLine",
                    x: start.x,
                    y: start.y,
                    x2: start.x,
                    y2: start.y,
                    lineStyle: "straight",
                };

                params.linePairIdsRef.current = {
                    primaryId: runItem.id,
                    secondaryId: passItem.id,
                };

                params.drawingItemIdRef.current = null;
                params.setItems((current) => [...current, runItem, passItem]);
                params.setSelectedItemId(null);
                return;
            }

            if (params.isPassReturnPairTool) {
                const passOutItem: BoardItem = {
                    id: makeId(),
                    type: "passLine",
                    x: start.x,
                    y: start.y,
                    x2: start.x,
                    y2: start.y,
                    lineStyle: "straight",
                };

                const passBackItem: BoardItem = {
                    id: makeId(),
                    type: "passLine",
                    x: start.x,
                    y: start.y,
                    x2: start.x,
                    y2: start.y,
                    lineStyle: "straight",
                };

                params.linePairIdsRef.current = {
                    primaryId: passOutItem.id,
                    secondaryId: passBackItem.id,
                };

                params.drawingItemIdRef.current = null;
                params.setItems((current) => [...current, passOutItem, passBackItem]);
                params.setSelectedItemId(null);
                return;
            }

            const item = createNewItem(
                params.selectedTool as PlaceableToolType,
                start.x,
                start.y,
                params.selectedHatColor,
                params.selectedGoalRotation
            );

            params.drawingItemIdRef.current =
                item.type === "runLine" || item.type === "passLine" || item.type === "guideLine"
                    ? item.id
                    : null;

            params.linePairIdsRef.current = null;
            params.setItems((current) => [...current, item]);
            params.setSelectedItemId(item.id);
        },

        onPanResponderMove: (event) => {
            if (params.isSelectMode) return;

            const start = params.drawingStartRef.current;
            if (!start) return;

            const rawEnd = toBoardCoords(
                event.nativeEvent.locationX,
                event.nativeEvent.locationY,
                params.boardWidth,
                params.boardHeight
            );

            const constrainedEnd = applyLineConstraint(
                start,
                rawEnd,
                params.lineConstraintMode
            );

            if (params.isRunPassPairTool) {
                const pairIds = params.linePairIdsRef.current;
                if (!pairIds) return;

                const gap = 0.025;

                const runLine = offsetParallelLine({
                    x1: start.x,
                    y1: start.y,
                    x2: constrainedEnd.x,
                    y2: constrainedEnd.y,
                    offset: -gap / 2,
                });

                const passLine = offsetParallelLine({
                    x1: start.x,
                    y1: start.y,
                    x2: constrainedEnd.x,
                    y2: constrainedEnd.y,
                    offset: gap / 2,
                });

                params.setItems((current) =>
                    current.map((item) => {
                        if (item.id === pairIds.primaryId) {
                            return {
                                ...item,
                                x: runLine.x1,
                                y: runLine.y1,
                                x2: runLine.x2,
                                y2: runLine.y2,
                            };
                        }

                        if (item.id === pairIds.secondaryId) {
                            return {
                                ...item,
                                x: passLine.x1,
                                y: passLine.y1,
                                x2: passLine.x2,
                                y2: passLine.y2,
                            };
                        }

                        return item;
                    })
                );

                return;
            }

            if (params.isPassReturnPairTool) {
                const pairIds = params.linePairIdsRef.current;
                if (!pairIds) return;

                const gap = 0.04;

                const outLine = offsetParallelLine({
                    x1: start.x,
                    y1: start.y,
                    x2: constrainedEnd.x,
                    y2: constrainedEnd.y,
                    offset: -gap / 2,
                });

                const backLane = offsetParallelLine({
                    x1: start.x,
                    y1: start.y,
                    x2: constrainedEnd.x,
                    y2: constrainedEnd.y,
                    offset: gap / 2,
                });

                params.setItems((current) =>
                    current.map((item) => {
                        if (item.id === pairIds.primaryId) {
                            return {
                                ...item,
                                x: outLine.x1,
                                y: outLine.y1,
                                x2: outLine.x2,
                                y2: outLine.y2,
                            };
                        }

                        if (item.id === pairIds.secondaryId) {
                            return {
                                ...item,
                                x: backLane.x2,
                                y: backLane.y2,
                                x2: backLane.x1,
                                y2: backLane.y1,
                            };
                        }

                        return item;
                    })
                );

                return;
            }

            if (params.isConeLineTool) {
                return;
            }

            if (!params.isLineTool) return;

            const drawingId = params.drawingItemIdRef.current;
            if (!drawingId) return;

            params.setItems((current) =>
                current.map((item) => {
                    if (item.id !== drawingId) return item;
                    return {
                        ...item,
                        x2: constrainedEnd.x,
                        y2: constrainedEnd.y,
                    };
                })
            );
        },

        onPanResponderRelease: (event) => {
            const start = params.drawingStartRef.current;

            if (params.isConeLineTool && start) {
                const rawEnd = toBoardCoords(
                    event.nativeEvent.locationX,
                    event.nativeEvent.locationY,
                    params.boardWidth,
                    params.boardHeight
                );

                const constrainedEnd = applyLineConstraint(
                    start,
                    rawEnd,
                    params.lineConstraintMode
                );

                params.setItems((current) => [
                    ...current,
                    ...createConeLineItemsFromDrag(
                        start.x,
                        start.y,
                        constrainedEnd.x,
                        constrainedEnd.y,
                        params.coneLineCount
                    ),
                ]);
            }

            params.drawingItemIdRef.current = null;
            params.linePairIdsRef.current = null;
            params.drawingStartRef.current = null;
        },

        onPanResponderTerminate: () => {
            params.drawingItemIdRef.current = null;
            params.linePairIdsRef.current = null;
            params.drawingStartRef.current = null;
        },
    });
}