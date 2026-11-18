import { describe,expect,it } from "vitest";
import { armsCrossed,BlinkDetector,fidgetJerk,headPose,inTouchZone,irisProjection } from "@/lib/vision/features";
import { EventDetector } from "@/lib/vision/events";
import { landmarkPoints,readLandmarkLog,writeLandmarkLog } from "@/lib/vision/landmarkLog";
import { readPitchTrack,semitones,writePitchTrack } from "@/lib/audio/pitch";
import { rmsDb,VoiceActivity } from "@/lib/audio/vad";
import { alignWords,whisperTimestamps } from "@/lib/report/align";
import { countHedges,identifyFillers,uptalkRate,voiceMetrics } from "@/lib/report/voiceMetrics";
import type { PitchFrame,TimedWord } from "@/types/report";
const point = (x:number,y:number,visibility=1) => ({x,y,visibility});
describe("vision geometry",()=>{
  it("reads column-major head pose and projects an iris onto the eye line",()=>{
    const rotation=[Math.sqrt(3)/2,0,-.5,0,0,1,0,0,.5,0,Math.sqrt(3)/2,0,0,0,0,1];
    expect(headPose(rotation).yaw).toBeCloseTo(30);
    expect(headPose(rotation).pitch).toBeCloseTo(0);
    expect(irisProjection(point(2,1),point(0,0),point(4,0))).toBe(.5);
  });
  it("counts a short blink on release and discards a 600 ms closure",()=>{
    const blink=new BlinkDetector();
    expect(blink.update(.6,100)).toBeNull();expect(blink.update(.4,150)).toBeNull();expect(blink.update(.3,200)).toBe(100);
    expect(blink.update(.7,500)).toBeNull();expect(blink.update(.2,1100)).toBeNull();
  });
  it("detects arm crossing, the lower touch zone, and fingertip jerk",()=>{
    expect(armsCrossed(point(1,1),point(3,1),point(2.6,1.5),point(1.4,1.6))).toBe(true);
    expect(armsCrossed(point(1,1),point(3,1),point(1.4,1.5),point(2.6,1.6))).toBe(false);
    const face={left:1,right:2,top:1,bottom:2};
    expect(inTouchZone(point(1.5,2.4),face,2)).toBe(true); expect(inTouchZone(point(1.5,2.51),face,2)).toBe(false);
    const hand=(offset:number)=>Array.from({length:21},()=>point(.5+offset,.5));
    expect(fidgetJerk([hand(0),hand(.03),hand(0),hand(.03)],1)).toBeCloseTo(.06);
  });
});
describe("event hysteresis",()=>{
  it("backdates, closes after one second, and merges a short gap",()=>{
    const detector=new EventDetector();
    detector.observe("self_touch",true,100,1);detector.observe("self_touch",true,800,1);
    detector.observe("self_touch",false,1000,1);detector.observe("self_touch",false,1999,1);
    expect(detector.events).toHaveLength(0);
    detector.observe("self_touch",false,2000,1);
    expect(detector.events[0]).toMatchObject({startMs:100,endMs:1000,severity:.48});
    detector.observe("self_touch",true,2500,1);detector.observe("self_touch",true,3200,1);
    detector.observe("self_touch",false,3300,1);detector.observe("self_touch",false,4300,1);
    expect(detector.events).toHaveLength(1);
    expect(detector.events[0]).toMatchObject({startMs:100,endMs:3300});
    expect(detector.events[0].severity).toBeCloseTo(.94);
  });
  it("does not qualify intermittent conditions",()=>{
    const detector=new EventDetector();
    detector.observe("slouch",true,0,1);detector.observe("slouch",false,1000,1);
    detector.observe("slouch",true,1500,1);detector.observe("slouch",true,6000,1);
    expect(detector.finish(6100)).toHaveLength(0);
  });
});
describe("audio and binary formats",()=>{
  it("measures a half-amplitude sine and converts pitch to semitones",()=>{
    const samples=Float32Array.from({length:16000},(_,i)=>.5*Math.sin(2*Math.PI*100*i/16000));
    expect(rmsDb(samples)).toBeCloseTo(-9.030899,5); expect(semitones(200)).toBe(12);expect(semitones(50)).toBe(-12);
  });
  it("backdates VAD onset and ends at the last above-threshold frame",()=>{
    const changes:unknown[]=[];
    const vad=new VoiceActivity(-55,(change)=>changes.push(change));
    for(let time=20;time<=120;time+=20)vad.update(-30,time);
    expect(vad.speaking).toBe(true);
    for(let time=140;time<=420;time+=20)vad.update(-55,time);
    expect(vad.speaking).toBe(false);expect(changes).toEqual([{startMs:0},{startMs:0,endMs:120}]);
  });
  it("round-trips LMK1 points and missing points",()=>{
    const face=Array.from({length:478},()=>point(.23,.45));
    const frames=[{ tMs:1200,points:landmarkPoints(face,[],[],[]) }];
    const result=readLandmarkLog(writeLandmarkLog(frames));
    expect(result[0].tMs).toBe(1200);expect(result[0].points[0]).toEqual({x:.23,y:.45});
    expect(result[0].points).toHaveLength(104);expect(result[0].points[51]).toBeUndefined();
  });
  it("round-trips PIT1 voiced and unvoiced pitch",()=>{
    const frames=[{tMs:32,st:1.25,rmsDb:-15.8},{tMs:64,st:null,rmsDb:-60}];
    expect(readPitchTrack(writePitchTrack(frames))).toEqual(frames);
  });
});
describe("alignment and final voice metrics",()=>{
  it("applies the mic offset, assigns words and discards echoes",()=>{
    const track=whisperTimestamps([{word:"noise",start:.1,end:.2},{word:"hello",start:1,end:1.1},{word:"later",start:5,end:5.2}],[],250,[]);
    expect(track.words[1]).toEqual({w:"hello",s:1250,e:1350});
    const aligned=alignWords([{idx:0,answerStartMs:1500,answerEndMs:2000,askEndMs:1000},{idx:1,answerStartMs:null,askEndMs:5000,answerEndMs:6000}],track);
    expect(aligned.get(0)?.words.map((w)=>w.w)).toEqual(["hello"]);expect(aligned.get(1)?.words.map((w)=>w.w)).toEqual(["later"]);
  });
  it("uses pauses or adjacent commas for soft fillers and longest nonoverlapping hedges",()=>{
    const words:TimedWord[]=[{w:"I",s:0,e:95},{w:"like",s:100,e:300},{w:"tables",s:340,e:500},{w:"actually,",s:800,e:950},{w:"you",s:1000,e:1100},{w:"know",s:1120,e:1250},{w:"um",s:1420,e:1520}];
    expect(identifyFillers(words).softFillers.map((word)=>word.w)).toEqual(["actually,","you know"]);
    expect(identifyFillers(words).hardFillers).toHaveLength(1);
    const hedge="I'm not sure I think it might happen".split(" ").map((w,i)=>({w,s:i*100,e:i*100+99}));
    expect(countHedges(hedge)).toBe(3);
  });
  it("computes pace, speaking time, ownership and long pauses",()=>{
    const words=["I","built","my","part","we","tested","our","plan","I","measured"].map((w,i)=>({w,s:i*600+(i>5?3000:0),e:i*600+100+(i>5?3000:0)}));
    const voice=voiceMetrics(words,[],[],{kind:"behavioral",startMs:0,endMs:10000,askEndMs:0});
    expect(voice.wpm).toBeCloseTo(120);expect(voice.speakingMs).toBe(5000);
    expect(voice.iRatio).toBe(3/5);expect(voice.longPauses).toEqual({count:1,totalMs:3500});
  });
  it("compares the final and preceding pitch windows and excludes questions",()=>{
    const segments=[0,2000,4000,6000].map((s,i)=>({s,e:s+1600,text:i===3?"A question?":"A statement."}));
    const pitch:PitchFrame[]=segments.flatMap(({s,e},i)=>[{tMs:s+600,st:1,rmsDb:-20},{tMs:e-200,st:i%2?1:4,rmsDb:-20}]);
    expect(uptalkRate(segments,pitch)).toBe(2/3);
  });
});
