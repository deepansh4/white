import React,{
  useRef,
  forwardRef,
  useImperativeHandle,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer
} from "react";

import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useCanvas, CANVAS_W, CANVAS_H } from "@/hooks/useCanvas";
import { useWhiteboardStore } from "@/store/useWhiteboardStore";

const PEN_SVG = encodeURIComponent(
`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>
<path d='M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'
fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/>
<circle cx='2.5' cy='21.5' r='1' fill='black'/>
</svg>`
);

const penCursor = `url("data:image/svg+xml,${PEN_SVG}") 2 22, crosshair`;

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 10;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const Canvas = forwardRef(({ rendererRef, emit }, ref) => {

  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const viewportRef = useRef(null);
  const xformDivRef = useRef(null);
  const gridDivRef = useRef(null);
  const zoomLabelRef = useRef(null);

  useImperativeHandle(ref, () => canvasRef.current);

  const { tool, eraserSize, cursors, users } = useWhiteboardStore();

  const toolRef = useRef(tool);
  const eraserSizeRef = useRef(eraserSize);

  useEffect(()=>{toolRef.current=tool},[tool]);
  useEffect(()=>{eraserSizeRef.current=eraserSize},[eraserSize]);

  const [, tick] = useReducer(n=>n+1,0);

  const T = useRef({x:0,y:0,zoom:1});

  const applyDOM = useCallback((t)=>{

    if(xformDivRef.current){
      xformDivRef.current.style.transform =
        `translate(${t.x}px,${t.y}px) scale(${t.zoom})`;
    }

    if(gridDivRef.current){
      const sz = 48 * t.zoom;

      gridDivRef.current.style.backgroundSize = `${sz}px ${sz}px`;
      gridDivRef.current.style.backgroundPosition =
        `${t.x % sz}px ${t.y % sz}px`;
    }

    if(zoomLabelRef.current){
      zoomLabelRef.current.textContent =
        `${Math.round(t.zoom*100)}%`;
    }

  },[]);

  const commit = useCallback((newT)=>{

    const vp = viewportRef.current;

    if(vp){

      const canvasW = CANVAS_W * newT.zoom;
      const canvasH = CANVAS_H * newT.zoom;

      if(newT.zoom <= 0.65){

        newT.x = (vp.clientWidth - canvasW) / 2;
        newT.y = (vp.clientHeight - canvasH) / 2;

      }else{

        const minX = vp.clientWidth - canvasW;
        const minY = vp.clientHeight - canvasH;

        newT.x = clamp(newT.x, minX, 0);
        newT.y = clamp(newT.y, minY, 0);

      }

    }

    T.current = newT;

    applyDOM(newT);

    tick();

  },[applyDOM]);

  const zoomTo = useCallback((vpX,vpY,newZoom)=>{

    const {x,y,zoom} = T.current;

    const z2 = clamp(newZoom,MIN_ZOOM,MAX_ZOOM);

    commit({
      x: vpX - (vpX - x) / zoom * z2,
      y: vpY - (vpY - y) / zoom * z2,
      zoom: z2
    });

  },[commit]);

  const initialView = useCallback(()=>{

    const vp = viewportRef.current;
    if(!vp) return;

    const rawZoom = Math.min(
      vp.clientWidth / CANVAS_W,
      vp.clientHeight / CANVAS_H
    );

    const zoom = clamp(rawZoom,0.85,1);

    commit({
      x:(vp.clientWidth - CANVAS_W*zoom)/2,
      y:(vp.clientHeight - CANVAS_H*zoom)/2,
      zoom
    });

  },[commit]);

  const fitView = useCallback(()=>{

    const vp = viewportRef.current;
    if(!vp) return;

    const zoom =
      Math.min(
        vp.clientWidth / CANVAS_W,
        vp.clientHeight / CANVAS_H
      ) * 0.9;

    commit({
      x:(vp.clientWidth - CANVAS_W*zoom)/2,
      y:(vp.clientHeight - CANVAS_H*zoom)/2,
      zoom
    });

  },[commit]);

  useLayoutEffect(initialView,[]);

  useEffect(()=>{

    const el = viewportRef.current;
    if(!el) return;

    const onWheel = (e)=>{

      e.preventDefault();

      const r = el.getBoundingClientRect();

      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;

      if(e.ctrlKey || e.metaKey){

        zoomTo(
          cx,
          cy,
          T.current.zoom * Math.pow(0.999,e.deltaY)
        );

      }else{

        const {x,y,zoom} = T.current;

        if(zoom > 0.65){
          commit({
            x:x - e.deltaX,
            y:y - e.deltaY,
            zoom
          });
        }

      }

    };

    el.addEventListener("wheel",onWheel,{passive:false});

    return ()=>el.removeEventListener("wheel",onWheel);

  },[zoomTo,commit]);

  const {
    handlePointerDown: drawDn,
    handlePointerMove: drawMv,
    handlePointerUp: drawUp
  } = useCanvas(canvasRef,overlayCanvasRef,rendererRef,emit);

  const dragOrigin = useRef(null);
  const drawing = useRef(false);

  const onPointerDown = useCallback((e)=>{

    e.preventDefault();

    if(toolRef.current==="pan"){

      dragOrigin.current = {
        px:e.clientX,
        py:e.clientY,
        tx:T.current.x,
        ty:T.current.y
      };

      return;
    }

    drawing.current = true;

    drawDn(e);

  },[drawDn]);

  const onPointerMove = useCallback((e)=>{

    if(dragOrigin.current){

      const {px,py,tx,ty} = dragOrigin.current;

      const {zoom} = T.current;

      if(zoom <= 0.65) return;

      commit({
        x: tx + e.clientX - px,
        y: ty + e.clientY - py,
        zoom
      });

      return;

    }

    if(drawing.current){

      drawMv(e);

    }

  },[drawMv,commit]);

  const onPointerUp = useCallback((e)=>{

    dragOrigin.current = null;

    if(drawing.current){

      drawing.current = false;

      drawUp(e);

    }

  },[drawUp]);

  const cursorStyle =
    tool === "pen" ? penCursor :
    tool === "eraser" ? "none" :
    tool === "pan" ? "grab" :
    "crosshair";

  const {x:tx,y:ty,zoom:tz} = T.current;

  const gridSz = 48 * tz;

  return(

    <div
      ref={viewportRef}
      className="relative w-full h-full overflow-hidden bg-canvas-bg touch-none"
      style={{cursor:cursorStyle}}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >

      <div
        ref={gridDivRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(200,196,188,0.35) 1px,transparent 1px)," +
            "linear-gradient(90deg,rgba(200,196,188,0.35) 1px,transparent 1px)",
          backgroundSize:`${gridSz}px ${gridSz}px`,
          backgroundPosition:`${tx % gridSz}px ${ty % gridSz}px`
        }}
      />

      <div
        ref={xformDivRef}
        className="absolute top-0 left-0"
        style={{
          width:CANVAS_W,
          height:CANVAS_H,
          transformOrigin:"0 0",
          transform:`translate(${tx}px,${ty}px) scale(${tz})`
        }}
      >

        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{width:CANVAS_W,height:CANVAS_H,display:"block"}}
        />

        <canvas
          ref={overlayCanvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="absolute inset-0 pointer-events-none"
        />

      </div>

      <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-2">

        <button
          onClick={()=>{
            const vp=viewportRef.current;
            zoomTo(
              vp.clientWidth/2,
              vp.clientHeight/2,
              T.current.zoom*1.3
            );
          }}
        >
          <ZoomIn size={14}/>
        </button>

        <button
          onClick={()=>{
            const vp=viewportRef.current;
            zoomTo(
              vp.clientWidth/2,
              vp.clientHeight/2,
              T.current.zoom*0.77
            );
          }}
        >
          <ZoomOut size={14}/>
        </button>

        <button onClick={fitView}>
          <Maximize2 size={14}/>
        </button>

        <span ref={zoomLabelRef}>
          {Math.round(tz*100)}%
        </span>

      </div>

    </div>

  );

});

Canvas.displayName="Canvas";

export default Canvas;