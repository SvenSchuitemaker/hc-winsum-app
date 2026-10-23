import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polygon, Text as SvgText } from "react-native-svg";
import { COLORS } from "../constants/theme";
import type { BoardItem, ExerciseBoardLayout } from "./exercise-board/boardTypes";
import {
    getArcPath, getBounceRunPath, getPasseerRunPath, getZigzagRunPath,
    getArrowHeadPath, renderHalfField, renderTopField,
} from "./exercise-board/boardRenderUtils";

type Props = { layout?: ExerciseBoardLayout | null; imageUrl?: string | null; autoplay?: boolean };
type Point = {x:number;y:number};
const SHIRT = "M 7 2.5 L 9 3.7 Q 11 5.3 13 3.7 L 15 2.5 L 21 6.5 L 18 12 L 15.9 10.9 L 15.9 20 L 6.1 20 L 6.1 10.9 L 4 12 L 1 6.5 Z";
const SHIRT_COLORS: Record<string,string> = {black:"#171717",orange:"#F39A25",blue:"#199ED8",grey:"#A5A5A5",white:"#F5F5F5",red:"#D93945",green:"#2EAD72"};

function linePath(item:BoardItem) {
    const x1=item.x*100, y1=item.y*100, x2=(item.x2??item.x)*100, y2=(item.y2??item.y)*100;
    if(item.type==="passLine"&&item.lineStyle==="arc")return getArcPath(x1,y1,x2,y2).d;
    if(item.type==="runLine"&&item.lineStyle==="zigzag")return getZigzagRunPath(x1,y1,x2,y2);
    if(item.type==="runLine"&&item.lineStyle==="bounce")return getBounceRunPath(x1,y1,x2,y2);
    if(item.type==="runLine"&&item.lineStyle==="passeer")return getPasseerRunPath(x1,y1,x2,y2);
    return `M ${x1} ${y1} L ${x2} ${y2}`;
}

// The exact SVG paths from the drawing editor use M, L and Q commands.
// Sampling those paths ensures a marker also follows arcs, zigzags and bounces.
export function sampleBoardPath(d:string):Point[] {
    const tokens=d.match(/[MLQ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)||[];
    const points:Point[]=[];
    let i=0, pos:Point={x:0,y:0};
    while(i<tokens.length){
        const cmd=tokens[i++];
        if(cmd==="M"||cmd==="L"){
            const x=Number(tokens[i++]),y=Number(tokens[i++]);
            if(!Number.isFinite(x)||!Number.isFinite(y))break;
            pos={x,y};points.push(pos);
        }else if(cmd==="Q"){
            const cx=Number(tokens[i++]),cy=Number(tokens[i++]),x=Number(tokens[i++]),y=Number(tokens[i++]);
            if(![cx,cy,x,y].every(Number.isFinite))break;
            const start=pos;
            for(let step=1;step<=30;step++){
                const t=step/30,k=1-t;
                points.push({x:k*k*start.x+2*k*t*cx+t*t*x,y:k*k*start.y+2*k*t*cy+t*t*y});
            }
            pos={x,y};
        }else break;
    }
    return points;
}
export function pathPosition(points:Point[],progress:number):Point {
    if(points.length===0)return {x:0,y:0};
    if(points.length===1)return points[0];
    const segments=points.slice(1).map((point,index)=>Math.hypot(point.x-points[index].x,point.y-points[index].y));
    const total=segments.reduce((sum,length)=>sum+length,0);
    let left=Math.max(0,Math.min(1,progress))*total;
    for(let index=0;index<segments.length;index++){
        if(left<=segments[index]||index===segments.length-1){
            const t=segments[index]?left/segments[index]:0;
            return {x:points[index].x+(points[index+1].x-points[index].x)*t,
                    y:points[index].y+(points[index+1].y-points[index].y)*t};
        }
        left-=segments[index];
    }
    return points[points.length-1];
}
function Jersey({x,y,color,label}: {x:number;y:number;color?:string;label?:string}) {
    const fill=SHIRT_COLORS[color||"blue"]||SHIRT_COLORS.blue;
    const textFill=["orange","white","grey"].includes(color||"")?"#111":"#fff";
    return <G transform={`translate(${x-2.86} ${y-2.86}) scale(0.26)`}>
        <Path d={SHIRT} fill={fill} stroke="#fff" strokeWidth="1.1"/>
        {!!label&&<SvgText x="11" y="15" textAnchor="middle" fontSize={label.length>2?"7":"9"} fontWeight="900" fill={textFill}>{label}</SvgText>}
    </G>;
}
export default function ExerciseAnimation({layout, autoplay=false}: Props) {
    const [playing,setPlaying]=useState(autoplay);
    const [elapsed,setElapsed]=useState(0);
    const lines=useMemo(() => {
        const ordered=(layout?.items||[]).filter(item=>
            ["runLine","passLine"].includes(item.type)&&typeof item.x2==="number"&&typeof item.y2==="number"
        );
        // A dribble/run must finish before a pass/shot that starts at its endpoint.
        // Imported images often list the pass before the corresponding run.
        for(let i=0;i<ordered.length;i++){
            const run=ordered[i];
            if(run.type!=="runLine")continue;
            const following=ordered.findIndex((candidate,index)=>index<i&&candidate.type==="passLine"&&
                Math.hypot((candidate.x-run.x2!),(candidate.y-run.y2!))<0.085);
            if(following>=0){ordered.splice(i,1);ordered.splice(following,0,run);}
        }
        return ordered.map(item=>({item,path:linePath(item),points:sampleBoardPath(linePath(item))}));
    },[layout]);
    const stillItems=useMemo(()=>(layout?.items||[]).filter(item=>!["runLine","passLine","guideLine"].includes(item.type)),[layout]);
    const runOwners=useMemo(()=>{
        const players=stillItems.filter(item=>["player","attacker","defender","trainer"].includes(item.type));
        const playerPositions=new Map(players.map(item=>[item.id,{x:item.x,y:item.y}]));
        return lines.map(({item})=>{
            if(item.type!=="runLine")return null;
            const nearest=players.reduce<BoardItem|null>((best,player)=>{
                const p=playerPositions.get(player.id)!;
                const distance=Math.hypot(p.x-item.x,p.y-item.y);
                const previous=best?Math.hypot(playerPositions.get(best.id)!.x-item.x,playerPositions.get(best.id)!.y-item.y):Infinity;
                return distance<previous?player:best;
            },null);
            if(nearest&&item.x2!==undefined&&item.y2!==undefined)
                playerPositions.set(nearest.id,{x:item.x2,y:item.y2});
            return nearest?.id||null;
        });
    },[lines,stillItems]);
    useEffect(()=>{if(!playing)return;const timer=setInterval(()=>setElapsed(ms=>(ms+50)%8000),50);return()=>clearInterval(timer);},[playing]);
    if(!layout)return null;
    const phase=elapsed/8000*lines.length;
    const activeIndex=Math.min(Math.floor(phase),Math.max(0,lines.length-1));
    const moving=lines[activeIndex];
    const position=moving?pathPosition(moving.points,phase-activeIndex):null;
    const playerPositions=new Map<string,Point>();
    lines.forEach(({item,points},index)=>{
        const owner=runOwners[index];
        if(!owner||index>activeIndex) return;
        const p=index===activeIndex?pathPosition(points,phase-activeIndex):pathPosition(points,1);
        playerPositions.set(owner,{x:p.x/100,y:p.y/100});
    });
    return <View style={styles.container}>
        <View style={styles.field}>
            <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                {layout.fieldOrientation==="top"?renderTopField():renderHalfField()}
                {(layout.items||[]).filter(item=>["runLine","passLine","guideLine"].includes(item.type)).map(item=>
                    <G key={item.id}>
                        <Path d={linePath(item)} stroke={item.strokeColor||(item.type==="runLine"?"#FFD166":"#6EC6FF")}
                            strokeWidth="0.8" strokeDasharray={item.dashed?"3 2":undefined} fill="none"/>
                        {item.arrowHead!==false&&<Path d={getArrowHeadPath(item.x*100,item.y*100,(item.x2??item.x)*100,(item.y2??item.y)*100)}
                            stroke={item.strokeColor||(item.type==="runLine"?"#FFD166":"#6EC6FF")} strokeWidth="0.6" fill="none"/>}
                    </G>
                )}
                {stillItems.map(item=>{
                    const x=item.x*100,y=item.y*100;
                    // Completed dribbles keep the player at the new position.
                    const playerAt=playerPositions.get(item.id);
                    if(item.type==="ball"&&moving)return null;
                    if(["player","attacker","defender","trainer"].includes(item.type))
                        return <Jersey key={item.id} x={(playerAt?.x??item.x)*100} y={(playerAt?.y??item.y)*100} color={item.shirtColor|| (item.type==="trainer"?"grey":"blue")} label={item.label|| (item.type==="trainer"?"T":"")}/>;
                    if(item.type==="cone")return <Polygon key={item.id} points={`${x},${y-2.2} ${x-2},${y+1.8} ${x+2},${y+1.8}`} fill="#ff7829" stroke="#fff" strokeWidth="0.5"/>;
                    if(item.type==="ball")return <Circle key={item.id} cx={x} cy={y} r={1} fill="#fff" stroke="#111" strokeWidth="0.5"/>;
                    if(item.type==="hat")return <Circle key={item.id} cx={x} cy={y} r={1.7} fill={item.color||"#f90"} stroke="#fff" strokeWidth="0.3"/>;
                    if(item.type==="goal")return <Path key={item.id} d={`M ${x-3} ${y-2} L ${x-3} ${y+2} L ${x+3} ${y+2} L ${x+3} ${y-2}`} stroke="#fff" strokeWidth="0.7" fill="none"/>;
                    if(item.type==="text")return <SvgText key={item.id} x={x} y={y} fill="#fff" fontSize="2.5" textAnchor="middle">{item.text||""}</SvgText>;
                    return null;
                })}
                {!!position&&!!moving&&<Circle cx={position.x+(moving.item.type==="runLine"?1.7:0)}
                    cy={position.y+(moving.item.type==="runLine"?1.7:0)} r={1.4} fill="#fff" stroke="#111" strokeWidth="0.6"/>}
            </Svg>
        </View>
        {lines.length?<View style={styles.controls}>
            <Pressable style={styles.button} onPress={()=>setPlaying(value=>!value)}><Text style={styles.buttonText}>{playing?"⏸ Pauzeren":"▶ Afspelen"}</Text></Pressable>
            <Pressable style={styles.button} onPress={()=>{setElapsed(0);setPlaying(false);}}><Text style={styles.buttonText}>↺ Opnieuw</Text></Pressable>
            <Text style={styles.caption}>Stap {activeIndex+1} van {lines.length}</Text>
        </View>:<Text style={styles.caption}>Teken loop- of passlijnen om de animatie te bekijken.</Text>}
    </View>;
}
const styles=StyleSheet.create({
    container:{gap:8},field:{width:"100%",aspectRatio:1.15,backgroundColor:"#112b46",borderRadius:10,overflow:"hidden"},
    controls:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:10},button:{backgroundColor:COLORS.primary,paddingVertical:10,paddingHorizontal:12,borderRadius:10},
    buttonText:{color:"#fff",fontWeight:"800"},caption:{color:COLORS.mutedText,fontSize:13}
});
