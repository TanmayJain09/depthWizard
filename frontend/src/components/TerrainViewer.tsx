import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { useAppStore } from "../store";
import type { TerrainGrid } from "../core/terrain";
import type { MeshBuildResult, MeshBuildParams } from "../core/terrain.worker";

function TerrainMesh({ meta, heightmapUrl, textureUrl, errorTextureData, showErrorMap, exaggeration, onGridParsed }: { meta: any, heightmapUrl: string, textureUrl: string | null, errorTextureData: Uint8Array | null, showErrorMap: boolean, exaggeration: number, onGridParsed: (grid: TerrainGrid) => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const [built, setBuilt] = useState(false);
  const [gridData, setGridData] = useState<Float32Array | null>(null);
  
  const texture = textureUrl ? new THREE.TextureLoader().load(textureUrl) : null;
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
  }

  const [errorTex, setErrorTex] = useState<THREE.DataTexture | null>(null);
  useEffect(() => {
    if (errorTextureData) {
      const dt = new THREE.DataTexture(errorTextureData, meta.width, meta.height, THREE.RGBAFormat);
      dt.needsUpdate = true;
      dt.magFilter = THREE.LinearFilter;
      dt.minFilter = THREE.LinearFilter;
      setErrorTex(dt);
    } else {
      setErrorTex(null);
    }
    return () => {
      if (errorTex) errorTex.dispose();
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
  }, [heightmapUrl, meta]);

  // Update exaggeration in place
  useEffect(() => {
    if (!built || !geomRef.current || !gridData) return;
    const pos = geomRef.current.getAttribute("position");
    if (!pos) return;
    
    const arr = pos.array as Float32Array;
    let v = 2; // z is at index 2, 5, 8...
    for (let i = 0; i < gridData.length; i++) {
      arr[v] = gridData[i] * exaggeration;
      v += 3;
    }
    
    pos.needsUpdate = true;
    geomRef.current.computeVertexNormals();
  }, [exaggeration, built, gridData]);

  useEffect(() => {
    return () => {
      if (geomRef.current) geomRef.current.dispose();
      if (texture) texture.dispose();
    };
  }, [texture]);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <bufferGeometry ref={geomRef} />
      {built && showErrorMap && errorTex ? (
        <meshStandardMaterial map={errorTex} side={THREE.DoubleSide} transparent={true} />
      ) : built && texture ? (
        <meshStandardMaterial map={texture} side={THREE.DoubleSide} wireframe={false} />
      ) : (
        <meshStandardMaterial color="#6B747C" wireframe={true} />
      )}
    </mesh>
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
  const { validationMetrics } = useAppStore();
  const [showErrorMap, setShowErrorMap] = useState(false);

  // We can track grid in window for the ValidationPanel hack, or we can use a callback.
  const handleGridParsed = (g: TerrainGrid) => {
    setGrid(g);
    (window as any)._currentGridData = g.data;
  };

  useEffect(() => {
    if (selectedFile) {
      setTextureUrl(URL.createObjectURL(selectedFile));
    }
    return () => {
      if (textureUrl) URL.revokeObjectURL(textureUrl);
    };
  }, [selectedFile]);

  const handlePointerMove = (e: any) => {
    if (!readoutRef.current || !grid) return;
    const intersects = e.intersections;
    if (intersects.length > 0) {
      const uv = intersects[0].uv;
      
      const px = Math.floor(uv.x * grid.width);
      const py = Math.floor((1.0 - uv.y) * grid.height);
      const h = grid.data[py * grid.width + px];
      
      const isGeo = result?.meta?.units === "metres";
      let text = `X: ${px} Y: ${py} | H: ${h.toFixed(2)}${isGeo ? "m" : ""}`;
      
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

  useEffect(() => {
    // clear points if tool changes
    if (activeTool !== "measure") {
      setMeasurePoints([]);
    }
  }, [activeTool]);

  if (!result || !result.meta || !result.heightmapUrl) return null;

  let distText = "";
  if (measurePoints.length === 2) {
    const d = measurePoints[0].distanceTo(measurePoints[1]);
    distText = `Distance: ${d.toFixed(2)}`;
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      <Canvas
        camera={{ position: [0, 500, 500], near: 0.1, far: 10000 }}
        style={{ background: "var(--bg-0)" }}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
      >
        <ambientLight intensity={0.2} />
        <directionalLight position={[1000, 1000, 500]} intensity={1.5} />
        <fog attach="fog" args={["#0D1013", 1000, 4000]} />
        
        <TerrainMesh 
          meta={result.meta}
          heightmapUrl={result.heightmapUrl}
          textureUrl={result.textureUrl || textureUrl}
          errorTextureData={validationMetrics?.errorTexture || null}
          showErrorMap={showErrorMap}
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

