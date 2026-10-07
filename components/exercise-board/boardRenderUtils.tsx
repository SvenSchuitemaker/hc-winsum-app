import React from "react";
import { Circle, Line, Path, Rect } from "react-native-svg";

export function getArrowHeadPath(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const ux = dx / len;
    const uy = dy / len;

    const arrowLength = 2.4;
    const arrowWidth = 1.4;

    const leftX = x2 - ux * arrowLength - uy * arrowWidth;
    const leftY = y2 - uy * arrowLength + ux * arrowWidth;
    const rightX = x2 - ux * arrowLength + uy * arrowWidth;
    const rightY = y2 - uy * arrowLength - ux * arrowWidth;

    return `M ${leftX} ${leftY} L ${x2} ${y2} L ${rightX} ${rightY}`;
}

export function getQuadraticSegmentPath(
    start: { x: number; y: number },
    end: { x: number; y: number },
    amplitude: number,
    direction: 1 | -1
) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const px = -dy / len;
    const py = dx / len;

    const controlX = midX + px * amplitude * direction;
    const controlY = midY + py * amplitude * direction;

    return {
        controlX,
        controlY,
        segment: `Q ${controlX} ${controlY} ${end.x} ${end.y}`,
    };
}

export function getZigzagRunPath(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const ux = dx / len;
    const uy = dy / len;
    const steps = 4;
    const amplitude = 2.2;

    const points = Array.from({ length: steps + 1 }).map((_, index) => ({
        x: x1 + ux * (len / steps) * index,
        y: y1 + uy * (len / steps) * index,
    }));

    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < steps; i += 1) {
        const direction: 1 | -1 = i % 2 === 0 ? 1 : -1;
        const { segment } = getQuadraticSegmentPath(points[i], points[i + 1], amplitude, direction);
        d += ` ${segment}`;
    }

    return d;
}

export function getZigzagArrowAngle(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const ux = dx / len;
    const uy = dy / len;
    const prevX = x2 - ux * (len / 4);
    const prevY = y2 - uy * (len / 4);
    const { controlX, controlY } = getQuadraticSegmentPath(
        { x: prevX, y: prevY },
        { x: x2, y: y2 },
        2.2,
        -1
    );

    return Math.atan2(y2 - controlY, x2 - controlX);
}

export function getArcPath(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const px = -dy / len;
    const py = dx / len;
    const amplitude = Math.max(7, len * 0.38);

    const controlX = midX + px * amplitude;
    const controlY = midY + py * amplitude;

    return {
        d: `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`,
        controlX,
        controlY,
    };
}

export function getArcArrowAngle(controlX: number, controlY: number, x2: number, y2: number) {
    return Math.atan2(y2 - controlY, x2 - controlX);
}

export function getBounceRunPath(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const ux = dx / len;
    const uy = dy / len;
    const px = -dy / len;
    const py = dx / len;

    const steps = Math.max(4, Math.floor(len / 6));
    const stepLen = len / steps;
    const amplitude = 2.2;

    let d = `M ${x1} ${y1}`;

    for (let i = 0; i < steps; i += 1) {
        const startX = x1 + ux * stepLen * i;
        const startY = y1 + uy * stepLen * i;
        const endX = x1 + ux * stepLen * (i + 1);
        const endY = y1 + uy * stepLen * (i + 1);
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        const controlX = midX + px * amplitude;
        const controlY = midY + py * amplitude;

        d += ` Q ${controlX} ${controlY} ${endX} ${endY}`;
    }

    return d;
}

export function getPasseerRunPath(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -dy / len;
    const py = dx / len;

    const loopCount = 3;
    const usableLen = Math.min(len * 0.45, 18);
    const leadIn = Math.max(2, len * 0.08);
    const loopLen = usableLen / loopCount;
    const amplitude = 2.3;

    let d = `M ${x1} ${y1}`;

    const firstX = x1 + ux * leadIn;
    const firstY = y1 + uy * leadIn;
    d += ` L ${firstX} ${firstY}`;

    for (let i = 0; i < loopCount; i += 1) {
        const segStartX = firstX + ux * loopLen * i;
        const segStartY = firstY + uy * loopLen * i;
        const segEndX = firstX + ux * loopLen * (i + 1);
        const segEndY = firstY + uy * loopLen * (i + 1);
        const midX = (segStartX + segEndX) / 2;
        const midY = (segStartY + segEndY) / 2;

        const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
        const controlX = midX + px * amplitude * dir;
        const controlY = midY + py * amplitude * dir;

        d += ` Q ${controlX} ${controlY} ${segEndX} ${segEndY}`;
    }

    d += ` L ${x2} ${y2}`;

    return d;
}

export function getArrowHeadPathFromAngle(x2: number, y2: number, angle: number) {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);

    const arrowLength = 2.4;
    const arrowWidth = 1.4;

    const leftX = x2 - ux * arrowLength - uy * arrowWidth;
    const leftY = y2 - uy * arrowLength + ux * arrowWidth;
    const rightX = x2 - ux * arrowLength + uy * arrowWidth;
    const rightY = y2 - uy * arrowLength - ux * arrowWidth;

    return `M ${leftX} ${leftY} L ${x2} ${y2} L ${rightX} ${rightY}`;
}

export function renderHalfField() {
    const stroke = "#F4F7F0";
    const grassA = "#4EAF00";
    const grassB = "#5EBA10";

    return (
        <>
            {Array.from({ length: 10 }).map((_, index) => {
                const x = (100 / 10) * index;
                return (
                    <Rect
                        key={`half-grass-${index}`}
                        x={x}
                        y="0"
                        width={100 / 10}
                        height="100"
                        fill={index % 2 === 0 ? grassA : grassB}
                    />
                );
            })}

            <Rect x="4" y="4" width="92" height="92" stroke={stroke} strokeWidth="1" fill="none" />
            <Line x1="50" y1="4" x2="50" y2="96" stroke={stroke} strokeWidth="0.9" />

            <Path
                d="M 96 20
           A 30 30 0 0 0 96 80"
                stroke={stroke}
                strokeWidth="1"
                fill="none"
            />

            <Path
                d="M 96 10
           A 40 40 0 0 0 96 90"
                stroke={stroke}
                strokeWidth="0.8"
                fill="none"
                strokeDasharray="1.5 2.5"
            />

            <Rect x="96" y="46" width="2.2" height="8" stroke={stroke} strokeWidth="0.6" fill="none" />
            <Circle cx="86" cy="50" r="0.8" fill={stroke} />
        </>
    );
}