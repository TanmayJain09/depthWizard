import React, { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, MapControls } from "@react-three/drei";
import * as THREE from "three";
import { useAppStore } from "../store";
import { parseGeoTiffUrl, parsePngUrl, TerrainGrid } from "../core/terrain";
import type { MeshBuildResult, MeshBuildParams } from "../core/terrain.worker";

function TerrainMesh({ grid, textureUrl }: { grid: TerrainGrid, textureUrl: string | null }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const [built, setBuilt] = useState(false);
  const texture = textureUrl ? new THREE.TextureLoader().load(textureUrl) : null;
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
  }

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
      exaggeration: 1.0, // default
    } as MeshBuildParams);

    return () => worker.terminate();
  }, [grid]);

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

export function TerrainViewer() {
  const { result, selectedFile } = useAppStore();
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
        
        <TerrainMesh grid={grid} textureUrl={textureUrl} />
        
        <MapControls 
          enableDamping 
          dampingFactor={0.05} 
          minDistance={10} 
          maxDistance={5000} 
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
      </Canvas>
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }}>
        <button className="btn-secondary" onClick={() => useAppStore.getState().reset()}>Close Viewer</button>
      </div>
    </div>
  );
}
