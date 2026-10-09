/* eslint-disable react/react-in-jsx-scope */
/* eslint-disable react-compiler/react-compiler */
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls, PointerLockControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { useAppStore } from "../store";
import type { TerrainGrid } from "../core/terrain";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { terrainCache, textureCache } from "../core/asset_loader";

function TerrainMesh({ jobId, meta, errorTextureData, refData, showErrorMap, showReference, exaggeration, onGridParsed }: { jobId: string, meta: any, errorTextureData: Uint8Array | null, refData: Float32Array | null, showErrorMap: boolean, showReference: boolean, exaggeration: number, onGridParsed: (grid: TerrainGrid) => void }) {
  const renderMode = useAppStore(s => s.renderMode);
  const meshRef = useRef<THREE.Mesh>(null);
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const [gridData, setGridData] = useState<Float32Array | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [geomError, setGeomError] = useState(false);
  const [isFlat, setIsFlat] = useState(false);
  const [built, setBuilt] = useState(false);
  const [minH, setMinH] = useState(0);
  const [maxH, setMaxH] = useState(0);

  const [rampColors, setRampColors] = useState<THREE.BufferAttribute | null>(null);

  const [errorTex, setErrorTex] = useState<THREE.DataTexture | null>(null);
  useEffect(() => {
    let dt: THREE.DataTexture | null = null;
    if (errorTextureData) {
      dt = new THREE.DataTexture(errorTextureData, meta.width, meta.height, THREE.RGBAFormat);
      dt.needsUpdate = true;
      dt.magFilter = THREE.LinearFilter;
      dt.minFilter = THREE.LinearFilter;
      setErrorTex(dt);
    } else {
      setErrorTex(null);
    }
    return () => {
      if (dt) dt.dispose();
    };
  }, [errorTextureData, meta.width, meta.height]);

  // Load from cache synchronously when jobId changes
  useEffect(() => {
    const meshResult = terrainCache.get(jobId);
    const tex = textureCache.get(jobId) || null;
    setTexture(tex);
    
    if (meshResult && geomRef.current) {
      const { positions, indices, uvs, data } = meshResult;
      geomRef.current.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geomRef.current.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geomRef.current.setIndex(new THREE.BufferAttribute(indices, 1));
      geomRef.current.computeVertexNormals();
      setBuilt(true);
      setGridData(data);
      onGridParsed({
        width: meta.width,
        height: meta.height,
        data,
        minHeight: meta.height_min,
        maxHeight: meta.height_max
      });

      let allNaN = true;
      let _min = Infinity;
      let _max = -Infinity;
      for (let i = 0; i < data.length; i++) {
        if (!Number.isNaN(data[i])) {
          allNaN = false;
          _min = Math.min(_min, data[i]);
          _max = Math.max(_max, data[i]);
        }
      }
      setGeomError(allNaN);
      setIsFlat(!allNaN && (_max - _min) < 1e-4);
      setMinH(_min);
      setMaxH(_max);
    }
  }, [jobId, meta, onGridParsed]);

  // Generate ramp colors if needed
  useEffect(() => {
    if (!gridData || built === false) return;
    const forceRamp = (!texture && !errorTex) || renderMode === "ramp";
    if (forceRamp) {
      const colors = new Float32Array(gridData.length * 3);
      const span = maxH - minH || 1;
      for (let i = 0; i < gridData.length; i++) {
        const h = gridData[i];
        const t = Math.max(0, Math.min(1, (h - minH) / span));
        // Hypsometric tint (blue/green -> yellow -> red -> white)
        let r, g, b;
        if (t < 0.25) { r=0; g=t*4; b=1; }
        else if (t < 0.5) { r=0; g=1; b=1-(t-0.25)*4; }
        else if (t < 0.75) { r=(t-0.5)*4; g=1; b=0; }
        else { r=1; g=1-(t-0.75)*4; b=0; }
        colors[i*3] = r; colors[i*3+1] = g; colors[i*3+2] = b;
      }
      setRampColors(new THREE.BufferAttribute(colors, 3));
    } else {
      setRampColors(null);
    }
  }, [renderMode, texture, gridData, built, minH, maxH, errorTex]);

  useEffect(() => {
    const geom = geomRef.current;
    if (geom && rampColors) {
      geom.setAttribute("color", rampColors);
    } else if (geom && geom.hasAttribute("color")) {
      geom.deleteAttribute("color");
    }
  }, [rampColors]);

  // Update exaggeration in place
  useEffect(() => {
    if (!built || !geomRef.current || !gridData) return;
    const pos = geomRef.current.getAttribute("position");
    if (!pos) return;
    
    const arr = pos.array as Float32Array;
    let v = 2; // z is at index 2, 5, 8...
    for (let i = 0; i < gridData.length; i++) {
      let h = gridData[i];
      if (showReference && refData) h = refData[i];
      arr[v] = h * exaggeration;
      v += 3;
    }
    
    pos.needsUpdate = true;
    geomRef.current.computeVertexNormals();
  }, [exaggeration, built, gridData, refData, showReference]);

  useEffect(() => {
    const geom = geomRef.current;
    return () => {
      if (geom) geom.dispose();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (texture) texture.dispose();
    };
  }, [texture]);

  return (
    <group>
      {geomError && (
        <Html center>
          <div style={{ background: "rgba(255,0,0,0.8)", padding: "12px", borderRadius: "8px", color: "white", fontWeight: "bold", whiteSpace: "nowrap" }}>
            Error: Invalid Terrain Data (NaN or Flat)
          </div>
        </Html>
      )}
      {isFlat && !geomError && (
        <Html center position={[0, 100, 0]}>
          <div style={{ background: "rgba(255,165,0,0.9)", padding: "12px", borderRadius: "8px", color: "#333", fontWeight: "bold", whiteSpace: "nowrap", textAlign: "center", border: "1px solid #c98200" }}>
            Almost no relief detected<br/><small>(probably no segmentation mask)</small>
          </div>
        </Html>
      )}
      {(!texture && built && !geomError) && (
        <Html center position={[0, -100, 0]}>
          <div style={{ background: "rgba(200,0,0,0.8)", padding: "12px", borderRadius: "8px", color: "white", fontWeight: "bold", whiteSpace: "nowrap", textAlign: "center" }}>
            Texture not available<br/><small>(Rendering height ramp instead)</small>
          </div>
        </Html>
      )}
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
        <bufferGeometry ref={geomRef} />
        {built && (
          showErrorMap && errorTex ? (
            <meshStandardMaterial map={errorTex} transparent={true} />
          ) : (renderMode === "ramp" || (!texture && !errorTex)) && rampColors ? (
            <meshStandardMaterial vertexColors={true} />
          ) : renderMode === "texture-only" && texture ? (
            <meshBasicMaterial map={texture} />
          ) : renderMode === "normals" ? (
            <meshNormalMaterial />
          ) : renderMode === "wireframe" ? (
            <meshStandardMaterial color="#6B747C" wireframe={true} />
          ) : texture ? (
            <meshStandardMaterial map={texture} />
          ) : (
            <meshStandardMaterial color="#6B747C" wireframe={true} />
          )
        )}
      </mesh>
    </group>
  );
}

function FlyCamera({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  const keys = useRef<{ [k: string]: boolean }>({});
  
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current[e.code] = true;
    const up = (e: KeyboardEvent) => keys.current[e.code] = false;
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, delta) => {
    if (!enabled) return;
    const speed = keys.current["ShiftLeft"] ? 150 : 50;
    const d = speed * delta;
    
    const dir = new THREE.Vector3();
    const right = new THREE.Vector3();
    
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    right.crossVectors(camera.up, dir).normalize();

    if (keys.current["KeyW"]) camera.position.addScaledVector(dir, d);
    if (keys.current["KeyS"]) camera.position.addScaledVector(dir, -d);
    if (keys.current["KeyA"]) camera.position.addScaledVector(right, d);
    if (keys.current["KeyD"]) camera.position.addScaledVector(right, -d);
    if (keys.current["KeyE"]) camera.position.y += d;
    if (keys.current["KeyQ"]) camera.position.y -= d;
  });

  return enabled ? <PointerLockControls onUnlock={() => useAppStore.getState().setCameraMode("orbit")} /> : null;
}

function CameraModeController() {
  const { camera } = useThree();
  const cameraMode = useAppStore(s => s.cameraMode);

  useEffect(() => {
    if (cameraMode === "fly") {
      const target = new THREE.Vector3();
      camera.getWorldDirection(target);
      target.add(camera.position);
      useAppStore.getState().setCameraMode("fly", {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [target.x, target.y, target.z]
      });
    } else {
      const state = useAppStore.getState().orbitCameraState;
      if (state) {
        camera.position.set(...state.position);
        camera.lookAt(...state.target);
      }
    }
  }, [cameraMode, camera]);

  return null;
}

function HoverRaycaster({ 
  grid, 
  readoutRef, 
  showReference, 
  showErrorMap,
  validationMetrics,
  result,
  mousePos,
  isHovering,
  cameraMode,
  activeTool,
  setMeasurePoints
}: any) {
  const { camera, scene, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const centerVec = useMemo(() => new THREE.Vector2(0, 0), []);

  useFrame(() => {
    if (!readoutRef.current || !grid) return;

    // Throttle / Skip if mouse is outside canvas in orbit mode
    if (cameraMode === "orbit" && !isHovering.current) {
      return;
    }

    // Set raycaster
    if (cameraMode === "fly") {
      raycaster.setFromCamera(centerVec, camera);
    } else {
      raycaster.setFromCamera(mousePos.current, camera);
    }

    const intersects = raycaster.intersectObjects(scene.children, true);
    // Find the first terrain mesh intersection
    const hit = intersects.find(x => x.object.name === "terrainMesh");

    if (hit && hit.uv) {
      const uv = hit.uv;
      const px = Math.floor(uv.x * grid.width);
      const py = Math.floor((1.0 - uv.y) * grid.height);
      const idx = py * grid.width + px;
      let h = grid.data[idx];
      if (showReference && validationMetrics?.refData) h = validationMetrics.refData[idx];
      
      const isGeo = result?.meta?.units === "metres";
      let text = `X: ${px} Y: ${py} | H: ${Number.isNaN(h) ? 'N/A' : h.toFixed(2)}${isGeo ? "m" : ""}`;
      
      if (showErrorMap && validationMetrics?.errorMap) {
        const err = validationMetrics.errorMap[py * grid.width + px];
        if (!Number.isNaN(err)) {
          text += ` | Err: ${err > 0 ? '+' : ''}${err.toFixed(2)}m`;
        }
      }

      readoutRef.current.innerText = text;
    }
  });

  // Handle click for measure tool (we moved this from Canvas onClick)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (activeTool !== "measure") return;
      
      // Raycast using click pos
      const clickPos = new THREE.Vector2();
      if (cameraMode === "fly") {
        clickPos.copy(centerVec);
      } else {
        const rect = gl.domElement.getBoundingClientRect();
        clickPos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        clickPos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      }
      
      raycaster.setFromCamera(clickPos, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      const hit = intersects.find(x => x.object.name === "terrainMesh");

      if (hit) {
        const p = hit.point.clone();
        setMeasurePoints((prev: THREE.Vector3[]) => {
          if (prev.length >= 2) return [p]; // restart
          return [...prev, p];
        });
      }
    };
    const el = gl.domElement;
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [activeTool, cameraMode, raycaster, camera, scene, gl.domElement, centerVec, setMeasurePoints]);

  return null;
}

function DebugSetup() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    (window as any).__terrainDebug = () => {
      let matInfo: any = null;
      let lights: any[] = [];
      let mapInfo: any = null;
      let hasColorAttr = false;
      let centerPixel = new Uint8Array(4);

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mat = obj.material as THREE.Material;
          const geom = obj.geometry as THREE.BufferGeometry;
          if (geom && geom.hasAttribute("color")) hasColorAttr = true;
          
          matInfo = {
            type: mat.type,
            color: (mat as any).color?.getHexString(),
            vertexColors: (mat as any).vertexColors,
          };
          if ((mat as any).map) {
            const map = (mat as any).map as THREE.Texture;
            const img = map.image as any;
            mapInfo = {
              present: true,
              width: img?.width,
              height: img?.height,
              readyState: img?.complete !== undefined ? img.complete : true,
              colorSpace: map.colorSpace,
              needsUpdate: map.needsUpdate
            };
          }
        }
        if (obj instanceof THREE.Light) {
          lights.push({ type: obj.type, intensity: obj.intensity, color: obj.color.getHexString() });
        }
      });

      // Render 1 frame to read pixel
      gl.render(scene, camera);
      const halfW = Math.floor(gl.domElement.width / 2);
      const halfH = Math.floor(gl.domElement.height / 2);
      gl.readRenderTargetPixels(null as any, halfW, halfH, 1, 1, centerPixel);
      
      return {
        material: matInfo,
        map: mapInfo,
        geometry: { hasColorAttr },
        lights,
        renderer: {
          toneMapping: gl.toneMapping,
          toneMappingExposure: gl.toneMappingExposure,
          outputColorSpace: gl.outputColorSpace
        },
        fog: scene.fog ? { color: (scene.fog as any).color.getHexString(), density: (scene.fog as any).density } : null,
        background: scene.background,
        camera: { position: camera.position.toArray(), near: (camera as any).near, far: (camera as any).far },
        centerPixelColorRGB: `rgb(${centerPixel[0]}, ${centerPixel[1]}, ${centerPixel[2]})`
      };
    };
    return () => {
      delete (window as any).__terrainDebug;
    };
  }, [gl, scene, camera]);
  return null;
}

import { useShallow } from 'zustand/react/shallow';

const DEFAULT_CAMERA = { position: [0, 500, 500] as const, fov: 60, near: 1, far: 20000 };
const CANVAS_STYLE = { background: "var(--bg-0)" };
const GL_OPTIONS = { preserveDrawingBuffer: true };

export function TerrainViewer() {
  const { result, selectedFile, cameraMode, exaggeration, activeTool } = useAppStore(useShallow(state => ({
    result: state.result,
    selectedFile: state.selectedFile,
    cameraMode: state.cameraMode,
    exaggeration: state.exaggeration,
    activeTool: state.activeTool
  })));
  const [grid, setGrid] = useState<TerrainGrid | null>(null);
  // Validation store data
  const { validationMetrics, showErrorMap, showReference } = useAppStore(useShallow(state => ({
    validationMetrics: state.validationMetrics,
    showErrorMap: state.showErrorMap,
    showReference: state.showReference
  })));
  const readoutRef = useRef<HTMLDivElement>(null);
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
  const textureUrl = useMemo(() => {
    return selectedFile ? URL.createObjectURL(selectedFile) : null;
  }, [selectedFile]);

  const handleGridParsed = useCallback((g: TerrainGrid) => {
    setGrid(g);
    (window as any)._currentGridData = g.data;
  }, []);

  useEffect(() => {
    return () => {
      if (textureUrl) URL.revokeObjectURL(textureUrl);
    };
  }, [textureUrl]);

  useEffect(() => {
    const handlePointerLockError = () => {
      if (useAppStore.getState().cameraMode === "fly") {
        useAppStore.getState().setCameraMode("orbit");
        alert("Fly mode cancelled. Click canvas to lock pointer and fly.");
      }
    };
    document.addEventListener("pointerlockerror", handlePointerLockError);
    return () => document.removeEventListener("pointerlockerror", handlePointerLockError);
  }, []);

  // Mouse tracking for orbit raycasting
  const mousePos = useRef(new THREE.Vector2());
  const isHovering = useRef(false);
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      mousePos.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mousePos.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  if (!result || !result.meta || !result.heightmapUrl) return null;

  let distText = "";
  if (measurePoints.length === 2) {
    const d = measurePoints[0].distanceTo(measurePoints[1]);
    distText = `Distance: ${d.toFixed(2)}`;
  }

  return (
    <div 
      className="viewer-container"
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
      onPointerEnter={() => (isHovering.current = true)}
      onPointerLeave={() => {
        isHovering.current = false;
        if (readoutRef.current) readoutRef.current.innerText = "Hover over terrain";
      }}
    >
      {showReference && (
        <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10, background: "var(--accent)", color: "var(--bg-0)", padding: "4px 12px", borderRadius: "16px", fontWeight: "bold" }}>
          REFERENCE
        </div>
      )}
      <Canvas
        camera={DEFAULT_CAMERA}
        style={CANVAS_STYLE}
        gl={GL_OPTIONS}
      >
        <HoverRaycaster 
          grid={grid} 
          readoutRef={readoutRef}
          showReference={showReference}
          showErrorMap={showErrorMap}
          validationMetrics={validationMetrics}
          result={result}
          mousePos={mousePos}
          isHovering={isHovering}
          cameraMode={cameraMode}
          activeTool={activeTool}
          setMeasurePoints={setMeasurePoints}
        />
        <CanvasExports />
        <CameraAnimator />
        <DebugSetup />
        
        <ambientLight intensity={0.2} />
        <hemisphereLight intensity={0.5} groundColor="#222" />
        <directionalLight position={[1000, 1000, 500]} intensity={1.5} />
        <fog attach="fog" args={["#0D1013", 1000, 4000]} />
        
        <TerrainMesh 
          jobId={result.meta.job_id}
          meta={result.meta}
          errorTextureData={validationMetrics?.errorTexture || null}
          refData={validationMetrics?.refData || null}
          showErrorMap={showErrorMap}
          showReference={showReference}
          exaggeration={exaggeration} 
          onGridParsed={handleGridParsed}
        />
        
        {measurePoints.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[5, 16, 16]} />
            <meshBasicMaterial color="#FF6A2B" depthTest={false} />
          </mesh>
        ))}

        {measurePoints.length === 2 && (
          <line>
            <bufferGeometry attach="geometry" {...new THREE.BufferGeometry().setFromPoints(measurePoints)} />
            <lineBasicMaterial attach="material" color="#FF6A2B" linewidth={3} depthTest={false} />
          </line>
        )}
        
        <CameraModeController />
        <MapControls 
          enabled={cameraMode === "orbit"}
          enableDamping 
          dampingFactor={0.05} 
          minDistance={10} 
          maxDistance={5000} 
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
        <FlyCamera enabled={cameraMode === "fly"} />
      </Canvas>
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }}>
        {cameraMode === "fly" && (
          <div className="mono-data" style={{ color: "var(--fg-1)", fontSize: "10px", background: "rgba(0,0,0,0.5)", padding: "4px", borderRadius: "4px" }}>
            Click canvas to fly. WASD to move. Q/E for altitude. Shift to sprint. Esc to unlock.
          </div>
        )}
        {activeTool === "measure" && measurePoints.length === 2 && (
          <div className="mono-data" style={{ color: "var(--ok)", fontSize: "12px", background: "rgba(0,0,0,0.5)", padding: "8px", borderRadius: "4px", marginTop: "8px" }}>
            {distText}
          </div>
        )}
      </div>
      <div style={{ position: "absolute", bottom: 16, left: 16, zIndex: 10, pointerEvents: "none" }}>
        <div ref={readoutRef} className="mono-data" style={{ color: "var(--fg-1)", fontSize: "11px", background: "rgba(0,0,0,0.5)", padding: "4px", borderRadius: "4px" }}>
          Hover over terrain
        </div>
      </div>
    </div>
  );
}

function CanvasExports() {
  const { gl, scene, camera } = useThree();
  
  useEffect(() => {
    const handleScreenshot = () => {
      gl.render(scene, camera);
      gl.domElement.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const mode = useAppStore.getState().showReference ? "reference" : "predicted";
        a.download = `screenshot_${mode}.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    };

    const handleMeshExport = () => {
      let targetMesh: THREE.Mesh | null = null;
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry && child.material) {
          if (!targetMesh) targetMesh = child;
        }
      });
      if (targetMesh) {
        const exporter = new OBJExporter();
        const objStr = exporter.parse(targetMesh);
        const blob = new Blob([objStr], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `terrain.obj`;
        a.click();
        URL.revokeObjectURL(url);
      }
    };

    window.addEventListener('export-screenshot', handleScreenshot);
    window.addEventListener('export-mesh', handleMeshExport);
    return () => {
      window.removeEventListener('export-screenshot', handleScreenshot);
      window.removeEventListener('export-mesh', handleMeshExport);
    };
  }, [gl, scene, camera]);

  return null;
}

function CameraAnimator() {
  const { camera } = useThree();
  const { activeBookmarkId, bookmarks, isTouring, tourSpeed } = useAppStore(useShallow(state => ({
    activeBookmarkId: state.activeBookmarkId,
    bookmarks: state.bookmarks,
    isTouring: state.isTouring,
    tourSpeed: state.tourSpeed
  })));
  const targetPos = useRef<THREE.Vector3 | null>(null);
  const targetRot = useRef<THREE.Euler | null>(null);
  
  useEffect(() => {
    if (activeBookmarkId) {
      const b = bookmarks.find(x => x.id === activeBookmarkId);
      if (b) {
        targetPos.current = new THREE.Vector3(...b.cameraState.position);
        if (b.cameraState.rotation) {
          targetRot.current = new THREE.Euler(...b.cameraState.rotation);
        } else {
          targetRot.current = null;
          camera.lookAt(new THREE.Vector3(...b.cameraState.target));
        }
      }
      useAppStore.getState().setActiveBookmarkId(null);
    }
  }, [activeBookmarkId, bookmarks, camera]);

  useFrame((_, delta) => {
    if (targetPos.current) {
      camera.position.lerp(targetPos.current, 0.05);
      if (camera.position.distanceTo(targetPos.current) < 1) targetPos.current = null;
    }
    if (targetRot.current) {
      camera.rotation.x += (targetRot.current.x - camera.rotation.x) * 0.05;
      camera.rotation.y += (targetRot.current.y - camera.rotation.y) * 0.05;
      camera.rotation.z += (targetRot.current.z - camera.rotation.z) * 0.05;
      if (Math.abs(targetRot.current.y - camera.rotation.y) < 0.01) targetRot.current = null;
    }

    if (isTouring && !targetPos.current) {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const radius = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
        const currentAngle = Math.atan2(camera.position.z, camera.position.x);
        const newAngle = currentAngle + tourSpeed * delta * 0.1;
        camera.position.x = Math.cos(newAngle) * radius;
        camera.position.z = Math.sin(newAngle) * radius;
        camera.lookAt(0, 0, 0);
      }
    }
  });

  useEffect(() => {
    const handleSave = () => {
      const mode = useAppStore.getState().cameraMode;
      const target = new THREE.Vector3();
      camera.getWorldDirection(target);
      target.add(camera.position);

      useAppStore.getState().addBookmark({
        id: crypto.randomUUID(),
        name: `View ${useAppStore.getState().bookmarks.length + 1}`,
        cameraState: {
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [target.x, target.y, target.z],
          mode,
          rotation: mode === "fly" ? [camera.rotation.x, camera.rotation.y, camera.rotation.z] : undefined,
          fov: (camera as THREE.PerspectiveCamera).fov
        }
      });
    };
    window.addEventListener('save-bookmark', handleSave);
    return () => window.removeEventListener('save-bookmark', handleSave);
  }, [camera]);

  return null;
}

