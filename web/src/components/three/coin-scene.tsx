"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type Props = {
  className?: string;
  /** Madalyonun kabın içindeki yeri (-1..1, sağ/yukarı pozitif). */
  focus?: { x: number; y: number };
  /** Dar (dikey) kapta kullanılacak yer. */
  narrowFocus?: { x: number; y: number };
  /** Madalyon boyutu çarpanı. */
  scale?: number;
  /** Yörüngedeki randevu karosu sayısı. */
  tiles?: number;
};

/**
 * "Siftah" madalyonu: ₺ kabartmalı altın para + etrafında dönen randevu karoları.
 * Saf Three.js (ek kütüphane yok). Ekranda değilken veya sekme gizliyken çizim durur.
 */
export default function CoinScene({
  className = "",
  focus = { x: 0.3, y: 0.25 },
  narrowFocus = { x: 0, y: 0.4 },
  scale = 1,
  tiles = 7,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { x: focusX, y: focusY } = focus;
  const { x: narrowX, y: narrowY } = narrowFocus;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return; // WebGL yoksa sahne gösterilmez; sayfa yine çalışır.
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.9;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 11);

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 6);
    const tealLight = new THREE.PointLight(0x2dd4bf, 28, 18, 1.6);
    tealLight.position.set(-5, -3, 1.5); // kenardan vursun, yüzü yeşile boyamasın
    const warmLight = new THREE.PointLight(0xffc56b, 55, 18, 1.6);
    warmLight.position.set(4, 3, 3);
    scene.add(key, tealLight, warmLight);

    const disposables: { dispose: () => void }[] = [envTexture, pmrem];
    const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

    /* ---------------- Madalyon ---------------- */
    const stage = new THREE.Group(); // fare ile eğilen kap
    const coin = new THREE.Group();
    stage.add(coin);
    scene.add(stage);

    const gold = track(
      new THREE.MeshPhysicalMaterial({ color: 0xf0b445, metalness: 1, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.15 }),
    );
    // Kenar: içeriden dışarıya kabarık bir çerçeve profili, Y ekseni etrafında döndürülür.
    const profile = [
      [1.3, 0.085],
      [1.38, 0.15],
      [1.52, 0.15],
      [1.6, 0.11],
      [1.62, 0],
      [1.6, -0.11],
      [1.52, -0.15],
      [1.38, -0.15],
      [1.3, -0.085],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const rim = new THREE.Mesh(track(new THREE.LatheGeometry(profile, 128)), gold);
    rim.rotation.x = Math.PI / 2;
    coin.add(rim);

    // Yüzey: kanvasa çizilen ₺ ve yazı, hem renk hem kabartma haritası olarak.
    const { map, bump } = drawFace(getComputedStyle(document.body).fontFamily || "system-ui");
    track(map);
    track(bump);
    const faceMaterial = track(
      new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 6, metalness: 1, roughness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.2 }),
    );
    const faceGeometry = track(new THREE.CircleGeometry(1.33, 128));
    const front = new THREE.Mesh(faceGeometry, faceMaterial);
    front.position.z = 0.086;
    const back = new THREE.Mesh(faceGeometry, faceMaterial);
    back.position.z = -0.086;
    back.rotation.y = Math.PI;
    coin.add(front, back);

    /* ---------------- Randevu karoları ---------------- */
    const tileGeometry = track(new RoundedBoxGeometry(0.86, 0.86, 0.16, 5, 0.14));
    const barGeometry = track(new RoundedBoxGeometry(0.48, 0.09, 0.05, 3, 0.04));
    const dotGeometry = track(new THREE.SphereGeometry(0.07, 24, 24));
    const tealTile = track(new THREE.MeshPhysicalMaterial({ color: 0x14b8a6, metalness: 0.1, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }));
    const darkTile = track(new THREE.MeshPhysicalMaterial({ color: 0x182023, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }));
    const glowTeal = track(new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x2dd4bf, emissiveIntensity: 2.2 }));
    const glowGold = track(new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xf5b544, emissiveIntensity: 2.2 }));
    const glowSoft = track(new THREE.MeshStandardMaterial({ color: 0xe6fffb, emissive: 0xccfbf1, emissiveIntensity: 0.8 }));

    const orbit = new THREE.Group();
    stage.add(orbit);
    const tileItems = Array.from({ length: tiles }, (_, i) => {
      const isTeal = i % 3 === 0;
      const tile = new THREE.Group();
      tile.add(new THREE.Mesh(tileGeometry, isTeal ? tealTile : darkTile));
      // Karonun yüzünde bir "saat" çizgisi ve durum noktası
      const bar = new THREE.Mesh(barGeometry, isTeal ? glowSoft : glowTeal);
      bar.position.set(0.06, -0.12, 0.09);
      const dot = new THREE.Mesh(dotGeometry, i % 4 === 1 ? glowGold : isTeal ? glowSoft : glowTeal);
      dot.position.set(-0.24, 0.18, 0.1);
      tile.add(bar, dot);
      orbit.add(tile);
      return {
        tile,
        angle: (i / tiles) * Math.PI * 2,
        speed: 0.16 + (i % 3) * 0.03,
        radius: 2.55 + (i % 2) * 0.35,
        lift: ((i % 3) - 1) * 0.35,
        spin: (i % 2 ? 1 : -1) * (0.3 + i * 0.05),
        size: 0.55 + (i % 3) * 0.12,
      };
    });

    // Etrafta süzülen küçük altın parçacıklar
    const sparkGeometry = track(new THREE.SphereGeometry(0.035, 12, 12));
    const sparks = Array.from({ length: 26 }, (_, i) => {
      const m = new THREE.Mesh(sparkGeometry, i % 3 ? glowGold : glowTeal);
      const a = Math.random() * Math.PI * 2;
      const r = 1.9 + Math.random() * 1.9;
      m.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 3.2, Math.sin(a) * r * 0.6);
      orbit.add(m);
      return { m, phase: Math.random() * Math.PI * 2, base: m.position.y };
    });

    /* ---------------- Yerleşim ---------------- */
    function layout() {
      const w = host!.clientWidth;
      const h = host!.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      const visibleW = visibleH * camera.aspect;
      // Dar kapta madalyon küçülür ki yörünge sığsın.
      const fit = Math.min(1, visibleW / 8.2, visibleH / 7);
      stage.scale.setScalar(fit * scale);
      const narrow = camera.aspect < 0.85;
      stage.position.set((visibleW / 2) * (narrow ? narrowX : focusX), (visibleH / 2) * (narrow ? narrowY : focusY), 0);
    }
    layout();
    const resizeObserver = new ResizeObserver(layout);
    resizeObserver.observe(host);

    /* ---------------- Etkileşim ve döngü ---------------- */
    const pointer = { x: 0, y: 0 };
    const tilt = { x: 0, y: 0 };
    function onPointerMove(e: PointerEvent) {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const clock = new THREE.Clock();
    function frame(t: number) {
      // Yay benzeri yumuşak takip
      tilt.x += (pointer.y * 0.35 - tilt.x) * 0.06;
      tilt.y += (pointer.x * 0.5 - tilt.y) * 0.06;
      stage.rotation.x = 0.18 + tilt.x;
      stage.rotation.y = -0.25 + tilt.y;

      // Yüz hep görünsün diye tam tur değil, salınım.
      coin.rotation.y = Math.sin(t * 0.5) * 0.65;
      coin.rotation.z = Math.sin(t * 0.3) * 0.06;
      coin.position.y = Math.sin(t * 0.9) * 0.08;

      for (const it of tileItems) {
        const a = it.angle + t * it.speed;
        it.tile.position.set(Math.cos(a) * it.radius, Math.sin(a * 1.3) * 0.5 + it.lift, Math.sin(a) * it.radius * 0.55);
        it.tile.rotation.set(Math.sin(t * 0.5 + it.angle) * 0.4, t * it.spin * 0.4, Math.cos(t * 0.4 + it.angle) * 0.25);
        it.tile.scale.setScalar(it.size);
      }
      for (const s of sparks) {
        s.m.position.y = s.base + Math.sin(t * 0.8 + s.phase) * 0.18;
        s.m.scale.setScalar(0.6 + Math.sin(t * 2 + s.phase) * 0.4);
      }
      renderer.render(scene, camera);
    }

    let raf = 0;
    let visible = true;
    function loop() {
      raf = requestAnimationFrame(loop);
      frame(clock.getElapsedTime());
    }
    function start() {
      if (!raf && visible && !document.hidden && !reduceMotion) loop();
    }
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(host);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    if (reduceMotion) frame(2.2);
    else start();

    return () => {
      stop();
      io.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [focusX, focusY, narrowX, narrowY, scale, tiles]);

  return <div ref={hostRef} className={className} aria-hidden />;
}

/** Madalyon yüzü: renk haritası (altın) ve kabartma haritası (beyaz = yüksek). */
function drawFace(fontFamily: string) {
  const size = 1024;
  const c = size / 2;
  const make = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    return [canvas, canvas.getContext("2d")!] as const;
  };

  const [colorCanvas, color] = make();
  const [bumpCanvas, bump] = make();

  // Zemin
  const g = color.createRadialGradient(c * 0.8, c * 0.7, 40, c, c, c);
  g.addColorStop(0, "#ffe3a1");
  g.addColorStop(0.55, "#efb54a");
  g.addColorStop(1, "#b97a1e");
  color.fillStyle = g;
  color.fillRect(0, 0, size, size);
  bump.fillStyle = "#000";
  bump.fillRect(0, 0, size, size);
  bump.filter = "blur(3px)"; // yumuşak kabartma kenarı

  const both = (fn: (ctx: CanvasRenderingContext2D, raised: boolean) => void) => {
    fn(color, false);
    fn(bump, true);
  };

  // İç halka
  both((ctx, raised) => {
    ctx.strokeStyle = raised ? "#fff" : "#a8691a";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.74, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Kenar yazısı
  const text = "SİFTAHGO  •  RANDEVU  •  SİFTAHGO  •  RANDEVU  •  ";
  both((ctx, raised) => {
    ctx.save();
    ctx.translate(c, c);
    ctx.fillStyle = raised ? "#fff" : "#9a5f14";
    ctx.font = `600 52px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const step = (Math.PI * 2) / text.length;
    for (let i = 0; i < text.length; i++) {
      ctx.save();
      ctx.rotate(i * step);
      ctx.fillText(text[i], 0, -c * 0.85);
      ctx.restore();
    }
    ctx.restore();
  });

  // Ortadaki ₺
  both((ctx, raised) => {
    ctx.fillStyle = raised ? "#fff" : "#a2641a";
    ctx.font = `700 470px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("₺", c, c + 20);
  });
  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  return { map, bump: bumpMap };
}
