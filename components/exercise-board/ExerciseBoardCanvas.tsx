import React from "react";
import { View } from "react-native";
import Svg, { G, Line, Path } from "react-native-svg";
import BoardItemOverlay from "./BoardItemOverlay";
import {
    getArcArrowAngle,
    getArcPath,
    getArrowHeadPath,
    getArrowHeadPathFromAngle,
    getBounceRunPath,
    getPasseerRunPath,
    getZigzagArrowAngle,
    getZigzagRunPath,
    renderHalfField,
} from "./boardRenderUtils";
import type { BoardItem } from "./boardTypes";

type Props = {
    captureTargetRef: React.RefObject<View | null>;
    boardStyle: any;
    onLayout: (event: any) => void;
    panHandlers: any;
    lineItems: BoardItem[];
    nonLineItems: BoardItem[];
    selectedItemId: string | null;
    isSelectMode: boolean;
    setSelectedItemId: (id: string) => void;
    boardWidth: number;
    boardHeight: number;
    itemLabels: Record<string, string>;
};

export default function ExerciseBoardCanvas({
    captureTargetRef,
    boardStyle,
    onLayout,
    panHandlers,
    lineItems,
    nonLineItems,
    selectedItemId,
    isSelectMode,
    setSelectedItemId,
    boardWidth,
    boardHeight,
    itemLabels,
}: Props) {
    return (
        <View ref={captureTargetRef} collapsable={false}>
            <View style={boardStyle} onLayout={onLayout} {...panHandlers}>
                <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {renderHalfField()}

                    {lineItems.map((item: BoardItem) => {
                        const x1 = item.x * 100;
                        const y1 = item.y * 100;
                        const x2 = (item.x2 ?? item.x) * 100;
                        const y2 = (item.y2 ?? item.y) * 100;
                        const selected = selectedItemId === item.id;

                        if (item.type === "guideLine") {
                            return (
                                <G key={item.id}>
                                    {isSelectMode && (
                                        <Line
                                            x1={x1}
                                            y1={y1}
                                            x2={x2}
                                            y2={y2}
                                            stroke="transparent"
                                            strokeWidth="10"
                                            onPress={() => setSelectedItemId(item.id)}
                                        />
                                    )}

                                    <Line
                                        x1={x1}
                                        y1={y1}
                                        x2={x2}
                                        y2={y2}
                                        stroke="#B8C7D9"
                                        strokeWidth={selected ? "1.2" : "0.8"}
                                        strokeDasharray="2 2"
                                    />
                                </G>
                            );
                        }

                        const stroke = item.type === "runLine" ? "#FFD166" : "#6EC6FF";

                        if (item.type === "runLine" && item.lineStyle === "zigzag") {
                            const zigzagPath = getZigzagRunPath(x1, y1, x2, y2);
                            const arrowAngle = getZigzagArrowAngle(x1, y1, x2, y2);
                            const arrowPath = getArrowHeadPathFromAngle(x2, y2, arrowAngle);

                            return (
                                <G key={item.id}>
                                    {isSelectMode && (
                                        <Line
                                            x1={x1}
                                            y1={y1}
                                            x2={x2}
                                            y2={y2}
                                            stroke="transparent"
                                            strokeWidth="14"
                                            onPress={() => setSelectedItemId(item.id)}
                                        />
                                    )}
                                    <Path
                                        d={zigzagPath}
                                        stroke={stroke}
                                        strokeWidth={selected ? "1.2" : "0.8"}
                                        fill="none"
                                    />
                                    <Path
                                        d={arrowPath}
                                        stroke={stroke}
                                        strokeWidth={selected ? "1" : "0.6"}
                                        fill="none"
                                    />
                                </G>
                            );
                        }

                        if (item.type === "runLine" && item.lineStyle === "bounce") {
                            const bouncePath = getBounceRunPath(x1, y1, x2, y2);
                            return (
                                <G key={item.id}>
                                    {isSelectMode && (
                                        <Line
                                            x1={x1}
                                            y1={y1}
                                            x2={x2}
                                            y2={y2}
                                            stroke="transparent"
                                            strokeWidth="14"
                                            onPress={() => setSelectedItemId(item.id)}
                                        />
                                    )}
                                    <Path
                                        d={bouncePath}
                                        stroke={stroke}
                                        strokeWidth={selected ? "1.2" : "0.8"}
                                        fill="none"
                                    />
                                </G>
                            );
                        }

                        if (item.type === "runLine" && item.lineStyle === "passeer") {
                            const passeerPath = getPasseerRunPath(x1, y1, x2, y2);
                            const arrowPath = getArrowHeadPath(x1, y1, x2, y2);

                            return (
                                <G key={item.id}>
                                    {isSelectMode && (
                                        <Line
                                            x1={x1}
                                            y1={y1}
                                            x2={x2}
                                            y2={y2}
                                            stroke="transparent"
                                            strokeWidth="14"
                                            onPress={() => setSelectedItemId(item.id)}
                                        />
                                    )}
                                    <Path
                                        d={passeerPath}
                                        stroke={stroke}
                                        strokeWidth={selected ? "1.2" : "0.8"}
                                        fill="none"
                                    />
                                    <Path
                                        d={arrowPath}
                                        stroke={stroke}
                                        strokeWidth={selected ? "1" : "0.6"}
                                        fill="none"
                                    />
                                </G>
                            );
                        }

                        if (item.type === "passLine" && item.lineStyle === "arc") {
                            const arc = getArcPath(x1, y1, x2, y2);
                            const arrowAngle = getArcArrowAngle(arc.controlX, arc.controlY, x2, y2);
                            const arrowPath = getArrowHeadPathFromAngle(x2, y2, arrowAngle);

                            return (
                                <G key={item.id}>
                                    {isSelectMode && (
                                        <Line
                                            x1={x1}
                                            y1={y1}
                                            x2={x2}
                                            y2={y2}
                                            stroke="transparent"
                                            strokeWidth="14"
                                            onPress={() => setSelectedItemId(item.id)}
                                        />
                                    )}
                                    <Path
                                        d={arc.d}
                                        stroke={stroke}
                                        strokeWidth={selected ? "1.2" : "0.8"}
                                        strokeDasharray="3 2"
                                        fill="none"
                                    />
                                    <Path
                                        d={arrowPath}
                                        stroke={stroke}
                                        strokeWidth={selected ? "1" : "0.6"}
                                        fill="none"
                                    />
                                </G>
                            );
                        }

                        return (
                            <G key={item.id}>
                                {isSelectMode && (
                                    <Line
                                        x1={x1}
                                        y1={y1}
                                        x2={x2}
                                        y2={y2}
                                        stroke="transparent"
                                        strokeWidth="10"
                                        onPress={() => setSelectedItemId(item.id)}
                                    />
                                )}

                                <Line
                                    x1={x1}
                                    y1={y1}
                                    x2={x2}
                                    y2={y2}
                                    stroke={stroke}
                                    strokeWidth={selected ? "1.2" : "0.8"}
                                    strokeDasharray={item.type === "passLine" ? "3 2" : undefined}
                                />
                                <Path
                                    d={getArrowHeadPath(x1, y1, x2, y2)}
                                    stroke={stroke}
                                    strokeWidth={selected ? "1" : "0.6"}
                                    fill="none"
                                />
                            </G>
                        );
                    })}
                </Svg>

                {nonLineItems.map((item: BoardItem) => (
                    <BoardItemOverlay
                        key={item.id}
                        item={item}
                        boardWidth={boardWidth}
                        boardHeight={boardHeight}
                        selected={selectedItemId === item.id}
                        isSelectMode={isSelectMode}
                        onSelect={() => setSelectedItemId(item.id)}
                        label={itemLabels[item.id]}
                    />
                ))}
            </View>
        </View>
    );
}