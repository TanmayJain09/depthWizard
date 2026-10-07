import React, { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, MapControls, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { useAppStore } from "../store";
import { parseGeoTiffUrl, parsePngUrl, TerrainGrid } from "../core/terrain";
import type { MeshBuildResult, MeshBuildParams } from "../core/terrain.worker";

function TerrainMesh({ grid, textureUrl, exaggeration }: { grid: TerrainGrid, textureUrl: string | null, exaggeration: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const [built, setBuilt] = useState(false);
  
  const texture = textureUrl ? new THREE.TextureLoader().load(textureUrl) : null;
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
  }

  // Initial build via worker
  useEffect(() => {
    const worker = new Worker(new URL("../core/terrain.worker.ts", import.meta.url), { type: "module" });
    
    worker.onmessage = (e: MessageEvent<MeshBuildResult>) => {
      if (!geomRef.current) return;
      const { positions, indices, uvs } = e.data;
      geomRef.current.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geomRef.current.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geomRef.current.setIndex(new THREE.BufferAttribute(indices, 1));
      geomRef.current.computeVertexNormals();
      setBuilt(true);
    };

    worker.postMessage({
      width: grid.width,
      height: grid.height,
      data: grid.data,
      exaggeration: 1.0, // baseline
    } as MeshBuildParams);

    return () => worker.terminate();
  }, [grid]);

  // Update exaggeration in place
  useEffect(() => {
    if (!built || !geomRef.current) return;
    const pos = geomRef.current.getAttribute("position");
    if (!pos) return;
    
    const arr = pos.array as Float32Array;
    let v = 2; // z is at index 2, 5, 8...
    for (let i = 0; i < grid.data.length; i++) {
      arr[v] = grid.data[i] * exaggeration;
      v += 3;
    }
    
    pos.needsUpdate = true;
    geomRef.current.computeVertexNormals();
  }, [exaggeration, built, grid]);

  useEffect(() => {
    return () => {
      if (geomRef.current) geomRef.current.dispose();
      if (texture) texture.dispose();
    };
  }, [texture]);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <bufferGeometry ref={geomRef} />
      {built && texture ? (
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

  useFrame((state, delta) => {
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
  const { result, selectedFile, cameraMode, exaggeration } = useAppStore();
  const [grid, setGrid] = useState<TerrainGrid | null>(null);
  const [textureUrl, setTextureUrl] = useState<string | null>(null);

  useEffect(() => {
    if (selectedFile) {
      setTextureUrl(URL.createObjectURL(selectedFile));
    }
    return () => {
      if (textureUrl) URL.revokeObjectURL(textureUrl);
    };
  }, [selectedFile]);

  useEffect(() => {
    if (!result) return;
    const load = async () => {
      const isGeo = result.dsmUrl.endsWith(".tif") || result.dsmUrl.endsWith(".tiff");
      const g = isGeo ? await parseGeoTiffUrl(result.dsmUrl) : await parsePngUrl(result.dsmUrl);
      setGrid(g);
    };
    load();
  }, [result]);

  if (!grid) return <div className="centered"><div className="mono-data" style={{ color: "var(--fg-1)" }}>Parsing Terrain...</div></div>;

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      <Canvas
        camera={{ position: [0, 500, 500], near: 0.1, far: 10000 }}
        style={{ background: "var(--bg-0)" }}
      >
        <ambientLight intensity={0.2} />
        <directionalLight position={[1000, 1000, 500]} intensity={1.5} />
        <fog attach="fog" args={["#0D1013", 1000, 4000]} />
        
        <TerrainMesh grid={grid} textureUrl={textureUrl} exaggeration={exaggeration} />
        
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
      </div>
    </div>
  );
}

