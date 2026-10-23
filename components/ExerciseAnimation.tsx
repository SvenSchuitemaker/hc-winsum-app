import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import { COLORS } from "../constants/theme";
import type { BoardItem, ExerciseBoardLayout } from "./exercise-board/boardTypes";

type Props = { layout?: ExerciseBoardLayout | null; imageUrl?: string | null; autoplay?: boolean };
const SHIRT = "M 7 2.5 L 9 3.7 Q 11 5.3 13 3.7 L 15 2.5 L 21 6.5 L 18 12 L 15.9 10.9 L 15.9 20 L 6.1 20 L 6.1 10.9 L 4 12 L 1 6.5 Z";
const COLORS_BY_SHIRT: Record<string, string> = {black:"#171717",orange:"#F39A25",blue:"#199ED8",grey:"#A5A5A5",white:"#F5F5F5",red:"#D93945",green:"#2EAD72"};

export default function ExerciseAnimation({layout, imageUrl, autoplay = false}: Props) {
    const [playing, setPlaying] = useState(autoplay);
    const [elapsed, setElapsed] = useState(0);
    const movements = useMemo(() => (layout?.items || []).filter(item =>
        ["runLine","passLine"].includes(item.type) && typeof item.x2 === "number" && typeof item.y2 === "number"
    ), [layout]);
    const players = useMemo(() => (layout?.items || []).filter(item =>
        ["player","attacker","defender","trainer"].includes(item.type)
    ), [layout]);
    useEffect(() => {
        if (!playing) return;
        const timer = setInterval(() => setElapsed(value => (value + 100) % 8000), 100);
        return () => clearInterval(timer);
    }, [playing]);
    if (!imageUrl) return null;
    const progress = elapsed / 8000;
    const phase = progress * movements.length;
    return <View style={styles.container}>
        <View style={styles.field}>
            <Image source={{uri:imageUrl}} style={styles.image} resizeMode="stretch"/>
            <Svg viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFillObject}>
                {movements.map((line:BoardItem, index:number) => {
                    const active = phase >= index && phase < index + 1;
                    if (!active) return null;
                    const t = Math.max(0, Math.min(1, phase - index));
                    const x = (line.x + ((line.x2 || 0) - line.x) * t) * 100;
                    const y = (line.y + ((line.y2 || 0) - line.y) * t) * 100;
                    if (line.type === "passLine") return <Circle key={line.id} cx={x} cy={y} r={1.6} fill="#fff" stroke="#111" strokeWidth={0.6}/>;
                    const player = players.reduce<BoardItem | null>((closest,item) => {
                        const distance = Math.hypot(item.x-line.x,item.y-line.y);
                        const old = closest ? Math.hypot(closest.x-line.x,closest.y-line.y) : Infinity;
                        return distance < old ? item : closest;
                    }, null);
                    const color = COLORS_BY_SHIRT[player?.shirtColor || "blue"] || COLORS_BY_SHIRT.blue;
                    return <G key={line.id} transform={`translate(${x-2.2} ${y-2.2}) scale(0.2)`}>
                        <Path d={SHIRT} fill={color} stroke="#fff" strokeWidth="1.5"/>
                        <SvgText x="11" y="15" textAnchor="middle" fontSize="8" fontWeight="900" fill="#fff">{player?.label || "1"}</SvgText>
                    </G>;
                })}
            </Svg>
        </View>
        {movements.length ? <View style={styles.controls}>
            <Pressable style={styles.button} onPress={() => setPlaying(value => !value)}><Text style={styles.buttonText}>{playing ? "⏸ Pauzeren" : "▶ Afspelen"}</Text></Pressable>
            <Pressable style={styles.button} onPress={() => { setElapsed(0); setPlaying(false); }}><Text style={styles.buttonText}>↺ Opnieuw</Text></Pressable>
            <Text style={styles.caption}>Stap {Math.min(movements.length, Math.floor(phase) + 1)} van {movements.length}</Text>
        </View> : <Text style={styles.caption}>Teken loop- of passlijnen om de animatie te bekijken.</Text>}
    </View>;
}
const styles = StyleSheet.create({
    container:{gap:8}, field:{width:"100%",aspectRatio:1.15,backgroundColor:"#112b46",borderRadius:10,overflow:"hidden"},
    image:{width:"100%",height:"100%"},controls:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:10},
    button:{backgroundColor:COLORS.primary,paddingVertical:10,paddingHorizontal:12,borderRadius:10},
    buttonText:{color:"#fff",fontWeight:"800"},caption:{color:COLORS.mutedText,fontSize:13}
});
