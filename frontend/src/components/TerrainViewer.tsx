/* eslint-disable react/react-in-jsx-scope */
/* eslint-disable react-compiler/react-compiler */
import { useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls, PointerLockControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { useAppStore } from "../store";
import type { TerrainGrid } from "../core/terrain";
import type { MeshBuildResult, MeshBuildParams } from "../core/terrain.worker";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";

function TerrainMesh({ meta, heightmapUrl, textureUrl, errorTextureData, refData, showErrorMap, showReference, exaggeration, onGridParsed }: { meta: any, heightmapUrl: string, textureUrl: string | null, errorTextureData: Uint8Array | null, refData: Float32Array | null, showErrorMap: boolean, showReference: boolean, exaggeration: number, onGridParsed: (grid: TerrainGrid) => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const [built, setBuilt] = useState(false);
  const [gridData, setGridData] = useState<Float32Array | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [textureError, setTextureError] = useState(false);
  const [geomError, setGeomError] = useState(false);

  useEffect(() => {
    if (textureUrl) {
      new THREE.TextureLoader().load(
        textureUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 16;
          setTexture(tex);
          setTextureError(false);
        },
        undefined,
        (err) => {
          console.error("Failed to load texture", err);
          setTextureError(true);
        }
      );
    } else {
      setTexture(null);
      setTextureError(false);
    }
  }, [textureUrl]);

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

  // Initial build via worker
  useEffect(() => {
    const worker = new Worker(new URL("../core/terrain.worker.ts", import.meta.url), { type: "module" });
    
    worker.onmessage = (e: MessageEvent<MeshBuildResult>) => {
      if (!geomRef.current) return;
      const { positions, indices, uvs, data } = e.data;
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

      // Check if data is all NaN or all equal
      let allNaN = true;
      for (let i = 0; i < data.length; i++) {
        if (!Number.isNaN(data[i])) {
          allNaN = false;
          break;
        }
      }
      setGeomError(allNaN);
    };

    worker.postMessage({
      heightmapUrl,
      width: meta.width,
      height: meta.height,
      minHeight: meta.height_min,
      maxHeight: meta.height_max,
      exaggeration: 1.0, 
    } as MeshBuildParams);

    return () => worker.terminate();
  }, [heightmapUrl, meta, onGridParsed]);

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
      {(textureError || geomError) && (
        <Html center>
          <div style={{ background: "rgba(255,0,0,0.8)", padding: "12px", borderRadius: "8px", color: "white", fontWeight: "bold", whiteSpace: "nowrap" }}>
            {geomError ? "Error: Invalid Terrain Data (NaN or Flat)" : "Error: Failed to load texture"}
          </div>
        </Html>
      )}
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
        <bufferGeometry ref={geomRef} />
        {built && showErrorMap && errorTex ? (
          <meshStandardMaterial map={errorTex} transparent={true} />
        ) : built && texture && !textureError ? (
          <meshStandardMaterial map={texture} wireframe={false} />
        ) : (
          <meshStandardMaterial color="#6B747C" wireframe={true} />
        )}
      </mesh>
    </group>
  );
}

function FlyCamera() {
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

  return <PointerLockControls />;
}

export function TerrainViewer() {
  const { result, selectedFile, cameraMode, exaggeration, activeTool } = useAppStore();
  const [grid, setGrid] = useState<TerrainGrid | null>(null);
  // Validation store data
  const { validationMetrics, showErrorMap, showReference } = useAppStore();
  const readoutRef = useRef<HTMLDivElement>(null);
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
  const textureUrl = useMemo(() => {
    return selectedFile ? URL.createObjectURL(selectedFile) : null;
  }, [selectedFile]);

  const handleGridParsed = (g: TerrainGrid) => {
    setGrid(g);
    (window as any)._currentGridData = g.data;
  };

  useEffect(() => {
    return () => {
      if (textureUrl) URL.revokeObjectURL(textureUrl);
    };
  }, [textureUrl]);

  const handlePointerMove = (e: any) => {
    if (!readoutRef.current || !grid) return;
    const intersects = e.intersections;
    if (intersects.length > 0) {
      const uv = intersects[0].uv;
      
      const px = Math.floor(uv.x * grid.width);
      const py = Math.floor((1.0 - uv.y) * grid.height);
      const idx = py * grid.width + px;
      let h = grid.data[idx];
      if (showReference && validationMetrics?.refData) h = validationMetrics.refData[idx];
      
      const isGeo = result?.meta?.units === "metres";
      let text = `X: ${px} Y: ${py} | H: ${Number.isNaN(h) ? 'N/A' : h.toFixed(2)}${isGeo ? "m" : ""}`;
      
      // If error map is active, show the error at cursor
      if (showErrorMap && validationMetrics?.errorMap) {
        const err = validationMetrics.errorMap[py * grid.width + px];
        if (!Number.isNaN(err)) {
          text += ` | Err: ${err > 0 ? '+' : ''}${err.toFixed(2)}m`;
        }
      }

      readoutRef.current.innerText = text;
    }
  };

  const handleClick = (e: any) => {
    if (activeTool === "measure") {
      const intersects = e.intersections;
      if (intersects.length > 0) {
        const p = intersects[0].point.clone();
        setMeasurePoints(prev => {
          if (prev.length >= 2) return [p]; // restart
          return [...prev, p];
        });
      }
    }
  };

  if (activeTool !== "measure" && measurePoints.length > 0) {
    setMeasurePoints([]);
  }

  if (!result || !result.meta || !result.heightmapUrl) return null;

  let distText = "";
  if (measurePoints.length === 2) {
    const d = measurePoints[0].distanceTo(measurePoints[1]);
    distText = `Distance: ${d.toFixed(2)}`;
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      {showReference && (
        <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10, background: "var(--accent)", color: "var(--bg-0)", padding: "4px 12px", borderRadius: "16px", fontWeight: "bold" }}>
          REFERENCE
        </div>
      )}
      <Canvas
        camera={{ position: [0, 500, 500], near: 0.1, far: 10000 }}
        style={{ background: "var(--bg-0)" }}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        gl={{ preserveDrawingBuffer: true }}
      >
        <CanvasExports />
        <CameraAnimator />
        <ambientLight intensity={0.2} />
        <directionalLight position={[1000, 1000, 500]} intensity={1.5} />
        <fog attach="fog" args={["#0D1013", 1000, 4000]} />
        
        <TerrainMesh 
          meta={result.meta}
          heightmapUrl={result.heightmapUrl}
          textureUrl={result.textureUrl || textureUrl}
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
        
        {cameraMode === "orbit" ? (
          <MapControls 
            enableDamping 
            dampingFactor={0.05} 
            minDistance={10} 
            maxDistance={5000} 
            maxPolarAngle={Math.PI / 2 - 0.05}
          />
        ) : (
          <FlyCamera />
        )}
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
  const { activeBookmarkId, bookmarks, isTouring, tourSpeed } = useAppStore();
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

