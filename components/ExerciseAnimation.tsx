import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polygon, Text as SvgText } from "react-native-svg";
import { COLORS } from "../constants/theme";
import type { BoardItem, ExerciseBoardLayout } from "./exercise-board/boardTypes";
import {
    getArcPath, getBounceRunPath, getPasseerRunPath, getZigzagRunPath,
    getArrowHeadPath, renderHalfField, renderTopField,
} from "./exercise-board/boardRenderUtils";

type AnimationPlan = { order: string[]; carryingRunIds: string[] };
type Props = { layout?: ExerciseBoardLayout | null; imageUrl?: string | null; autoplay?: boolean; exerciseId?: number; onClose?: () => void };
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
export default function ExerciseAnimation({layout, autoplay=false,exerciseId,onClose}: Props) {
    const [aiPlan,setAiPlan]=useState<AnimationPlan|null>(null);
    const [planning,setPlanning]=useState(!!exerciseId);
    useEffect(()=>{
        let active=true;
        setAiPlan(null);
        if(!exerciseId){setPlanning(false);return;}
        setPlanning(true);
        import("../lib/supabase").then(async({supabase})=>{
            if(!supabase)return;
            const {data,error}=await supabase.functions.invoke("plan-exercise-animation",{body:{exerciseId}});
            if(!active||error||!data||!Array.isArray(data.order))return;
            setAiPlan({order:data.order,carryingRunIds:Array.isArray(data.carryingRunIds)?data.carryingRunIds:[]});
            setElapsed(0);
        }).catch(()=>{}).finally(()=>{if(active)setPlanning(false);});
        return()=>{active=false;};
    },[exerciseId]);
    const [playing,setPlaying]=useState(autoplay);
    const [elapsed,setElapsed]=useState(0);
    const lines=useMemo(() => {
        const drawn=(layout?.items||[]).filter(item=>
            ["runLine","passLine"].includes(item.type)&&typeof item.x2==="number"&&typeof item.y2==="number"
        );
        const ordered=[...drawn];
        if(aiPlan?.order?.length===drawn.length &&
            new Set(aiPlan.order).size===drawn.length &&
            aiPlan.order.every(id=>drawn.some(item=>item.id===id))){
            ordered.sort((a,b)=>aiPlan.order.indexOf(a.id)-aiPlan.order.indexOf(b.id));
        }else{
            // Offline fallback: schedule receiving runs before the pass arriving at
            // their endpoint and dribbles before passes leaving their endpoint.
            for(let attempt=0;attempt<ordered.length;attempt++){
                let changed=false;
                for(let i=0;i<ordered.length;i++){
                    const run=ordered[i];
                    if(run.type!=="runLine")continue;
                    const laterPass=ordered.findIndex((candidate,index)=>index<i&&candidate.type==="passLine"&&(
                        Math.hypot(candidate.x-run.x2!,candidate.y-run.y2!)<0.065 ||
                        Math.hypot(candidate.x2!-run.x2!,candidate.y2!-run.y2!)<0.065
                    ));
                    if(laterPass>=0){
                        ordered.splice(i,1);
                        ordered.splice(laterPass,0,run);
                        changed=true;
                        break;
                    }
                }
                if(!changed)break;
            }
        }
        return ordered.map(item=>({item,path:linePath(item),points:sampleBoardPath(linePath(item))}));
    },[layout,aiPlan]);
    const carryingRuns=useMemo(()=>{
        if(aiPlan)return new Set(aiPlan.carryingRunIds);
        const carrying=new Set<string>();
        lines.forEach(({item},index)=>{
            if(item.type!=="runLine")return;
            const previous=lines.slice(0,index).reverse().find(({item:before})=>
                before.type==="passLine"&&Math.hypot(before.x2!-item.x,before.y2!-item.y)<0.065);
            if(previous)carrying.add(item.id);
        });
        return carrying;
    },[aiPlan,lines]);
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
                {!!position&&!!moving&&(moving.item.type==="passLine"||carryingRuns.has(moving.item.id))&&<Circle cx={position.x+(moving.item.type==="runLine"?1.7:0)}
                    cy={position.y+(moving.item.type==="runLine"?1.7:0)} r={1.4} fill="#fff" stroke="#111" strokeWidth="0.6"/>}
            </Svg>
        </View>
        <View style={styles.controls}>
            <View style={styles.buttons}>
                <Pressable style={[styles.button,styles.primaryButton]} onPress={()=>setPlaying(value=>!value)}>
                    <Text style={styles.buttonText}>{playing?"⏸ Pauzeren":"▶ Afspelen"}</Text>
                </Pressable>
                <Pressable style={styles.button} onPress={()=>{setElapsed(0);setPlaying(false);}}>
                    <Text style={styles.buttonText}>↺ Opnieuw</Text>
                </Pressable>
                {!!onClose&&<Pressable style={[styles.button,styles.closeButton]} onPress={onClose}>
                    <Text style={styles.buttonText}>✕ Sluiten</Text>
                </Pressable>}
            </View>
            <Text style={styles.caption}>{planning?"AI bekijkt de oefening en bepaalt wie passt, loopt en schiet…":lines.length?`Stap ${activeIndex+1} van ${lines.length}`:"Teken loop- of passlijnen om de animatie te bekijken."}</Text>
        </View>
    </View>;
}
const styles=StyleSheet.create({
    container:{gap:12,marginBottom:16},
    field:{width:"100%",aspectRatio:1.15,backgroundColor:"#112b46",borderRadius:12,overflow:"hidden"},
    controls:{backgroundColor:COLORS.surface,borderRadius:14,borderWidth:1,borderColor:COLORS.border,padding:12,gap:12},
    buttons:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:8},
    button:{backgroundColor:COLORS.surfaceLight,paddingVertical:11,paddingHorizontal:14,borderRadius:10,minHeight:44,justifyContent:"center",alignItems:"center"},
    primaryButton:{backgroundColor:COLORS.primary},
    closeButton:{borderWidth:1,borderColor:COLORS.border,marginLeft:"auto"},
    buttonText:{color:"#fff",fontWeight:"800",fontSize:14},
    caption:{color:COLORS.mutedText,fontSize:13,textAlign:"center"}
});
