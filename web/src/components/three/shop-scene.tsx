"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

type Props = {
  className?: string;
  /** Dükkânın kabın içindeki yeri (-1..1, sağ/yukarı pozitif). */
  focus?: { x: number; y: number };
  /** Dar (dikey) kapta kullanılacak yer. */
  narrowFocus?: { x: number; y: number };
  /** Dükkân boyutu çarpanı. */
  scale?: number;
  /** Yörüngedeki randevu karosu sayısı. */
  tiles?: number;
};

/**
 * "Siftah" dükkânı: tenteli, vitrini yanan, kapısında "AÇIK" levhası sallanan mini dükkân
 * + etrafında dönen randevu karoları. Saf Three.js (ek kütüphane yok). Ekranda değilken veya
 * sekme gizliyken çizim durur.
 */
export default function ShopScene({
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
    // Geç kurulduğu için (bkz. shop.tsx) belirerek gelir.
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;opacity:0;transition:opacity 0.8s";
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
    tealLight.position.set(-5, -3, 1.5); // kenardan vursun, cepheyi yeşile boyamasın
    const warmLight = new THREE.PointLight(0xffc56b, 55, 18, 1.6);
    warmLight.position.set(4, 3, 3);
    scene.add(key, tealLight, warmLight);

    const disposables: { dispose: () => void }[] = [envTexture, pmrem];
    const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);
    const fontFamily = getComputedStyle(document.body).fontFamily || "system-ui";

    /* ---------------- Malzemeler ---------------- */
    const gold = track(
      new THREE.MeshPhysicalMaterial({ color: 0xf0b445, metalness: 1, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.15 }),
    );
    const wall = track(new THREE.MeshPhysicalMaterial({ color: 0x0f766e, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 }));
    const dark = track(new THREE.MeshPhysicalMaterial({ color: 0x182023, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }));
    const cream = track(new THREE.MeshPhysicalMaterial({ color: 0xf4efe4, roughness: 0.5, clearcoat: 0.3, side: THREE.DoubleSide }));
    const stripe = track(new THREE.MeshPhysicalMaterial({ color: 0x14b8a6, roughness: 0.35, clearcoat: 0.6, side: THREE.DoubleSide }));
    const leaf = track(new THREE.MeshPhysicalMaterial({ color: 0x15803d, roughness: 0.6, clearcoat: 0.2 }));
    const glass = track(new THREE.MeshStandardMaterial({ color: 0x0b1214, emissive: 0x2dd4bf, emissiveIntensity: 0.35, roughness: 0.1 }));

    /* ---------------- Dükkân ---------------- */
    const stage = new THREE.Group(); // fare ile eğilen kap
    const shop = new THREE.Group();
    const model = new THREE.Group(); // dükkânı kendi ortasına oturtur
    model.position.y = 0.15;
    model.scale.setScalar(0.92);
    shop.add(model);
    stage.add(shop);
    scene.add(stage);

    const box = (w: number, h: number, d: number, r = 0.04) => track(new RoundedBoxGeometry(w, h, d, 4, r));
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = model) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };

    // Kaldırım, gövde ve çatı (gövde: y -1.2..0.6, cephe z = 0.65)
    add(box(2.95, 0.2, 1.9, 0.06), dark, 0, -1.3, 0.15);
    add(box(2.5, 1.8, 1.3, 0.05), wall, 0, -0.3, 0);
    add(box(2.62, 0.12, 1.42), gold, 0, 0.66, 0);

    // Tabela: koyu zemin üstünde parlayan altın "SİFTAHGO"
    add(box(2.62, 0.5, 0.16), dark, 0, 0.92, 0.6);
    const signTexture = track(
      drawTexture(1024, 160, (ctx, w, h) => {
        ctx.fillStyle = "#0b1012";
        ctx.fillRect(0, 0, w, h);
        const g = ctx.createLinearGradient(0, 20, 0, h - 20);
        g.addColorStop(0, "#ffe3a1");
        g.addColorStop(1, "#e9a93a");
        ctx.fillStyle = g;
        ctx.font = `700 104px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.letterSpacing = "14px";
        ctx.fillText("SİFTAHGO", w / 2, h / 2 + 6);
      }),
    );
    add(
      track(new THREE.PlaneGeometry(2.5, 0.39)),
      track(new THREE.MeshStandardMaterial({ map: signTexture, emissiveMap: signTexture, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4 })),
      0,
      0.92,
      0.681,
    );

    // Tente: dönüşümlü turkuaz/krem şeritler ve önünde yarım daire saçaklar
    const stripes = 8;
    const stripeW = 2.7 / stripes;
    const slope = Math.hypot(0.4, 0.55);
    const stripeGeometry = track(new THREE.BoxGeometry(stripeW, 0.035, slope));
    const scallopGeometry = track(new THREE.CircleGeometry(stripeW / 2, 20, Math.PI, Math.PI));
    for (let i = 0; i < stripes; i++) {
      const x = -1.35 + stripeW * (i + 0.5);
      const material = i % 2 ? cream : stripe;
      add(stripeGeometry, material, x, 0.25, 0.925).rotation.x = Math.atan2(0.4, 0.55);
      add(scallopGeometry, material, x, 0.05, 1.2);
    }

    // Vitrin: sıcak ışıkla yanan cam, altın çerçeve ve kayıt
    add(box(1.27, 0.92, 0.08, 0.03), gold, -0.5, -0.35, 0.66);
    const windowTexture = track(
      drawTexture(512, 356, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w * 0.45, h * 0.35, 20, w / 2, h / 2, w * 0.7);
        g.addColorStop(0, "#fff1c9");
        g.addColorStop(0.6, "#f5b544");
        g.addColorStop(1, "#b9741c");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        // Raflar ve üstlerindeki ürün siluetleri
        ctx.fillStyle = "rgba(90, 50, 10, 0.55)";
        for (const y of [h * 0.42, h * 0.82]) {
          ctx.fillRect(16, y, w - 32, 10);
          for (let x = 40; x < w - 40; x += 58) {
            const ph = 30 + ((x * 7) % 34);
            ctx.fillRect(x, y - ph, 34, ph);
          }
        }
      }),
    );
    add(
      track(new THREE.PlaneGeometry(1.15, 0.8)),
      track(new THREE.MeshStandardMaterial({ map: windowTexture, emissiveMap: windowTexture, emissive: 0xffffff, emissiveIntensity: 1.1 })),
      -0.5,
      -0.35,
      0.702,
    );
    add(track(new THREE.BoxGeometry(0.04, 0.8, 0.02)), gold, -0.5, -0.35, 0.71);
    add(track(new THREE.BoxGeometry(1.15, 0.04, 0.02)), gold, -0.5, -0.35, 0.71);
    add(box(1.35, 0.06, 0.16, 0.02), gold, -0.5, -0.81, 0.72);
    const windowGlow = new THREE.PointLight(0xffc56b, 6, 3, 1.6); // kaldırıma vuran vitrin ışığı
    windowGlow.position.set(-0.5, -0.4, 1.3);
    model.add(windowGlow);

    // Kapı: altın kasa, koyu kanat, hafif parlayan cam ve kulp
    add(box(0.74, 1.28, 0.08, 0.03), gold, 0.68, -0.56, 0.66);
    add(box(0.62, 1.18, 0.06, 0.03), dark, 0.68, -0.6, 0.71);
    add(track(new THREE.PlaneGeometry(0.44, 0.6)), glass, 0.68, -0.38, 0.742);
    add(track(new THREE.SphereGeometry(0.045, 20, 20)), gold, 0.9, -0.68, 0.77);
    add(box(0.8, 0.06, 0.25, 0.02), cream, 0.68, -1.17, 0.82); // basamak

    // Kapıda ipe asılı, sallanan "AÇIK" levhası
    const hanger = new THREE.Group();
    hanger.position.set(0.68, -0.08, 0.79);
    model.add(hanger);
    add(track(new THREE.SphereGeometry(0.025, 12, 12)), gold, 0, 0, 0, hanger);
    const stringGeometry = track(new THREE.CylinderGeometry(0.006, 0.006, Math.hypot(0.15, 0.14), 6));
    for (const side of [-1, 1]) {
      const string = add(stringGeometry, gold, side * 0.075, -0.07, 0, hanger);
      string.rotation.z = side * Math.atan2(0.15, 0.14);
    }
    add(box(0.44, 0.2, 0.03, 0.012), cream, 0, -0.24, 0, hanger);
    const openTexture = track(
      drawTexture(256, 112, (ctx, w, h) => {
        ctx.fillStyle = "#f4efe4";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#0f766e";
        ctx.font = `800 72px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("AÇIK", w / 2, h / 2 + 4);
      }),
    );
    add(track(new THREE.PlaneGeometry(0.4, 0.175)), track(new THREE.MeshStandardMaterial({ map: openTexture, roughness: 0.5 })), 0, -0.24, 0.016, hanger);

    // Kapının iki yanında saksı çiçekleri
    const potGeometry = track(new THREE.CylinderGeometry(0.12, 0.09, 0.2, 24));
    const bushGeometry = track(new THREE.SphereGeometry(0.17, 24, 24));
    for (const x of [-1.17, 1.17]) {
      add(potGeometry, cream, x, -1.1, 0.85);
      add(bushGeometry, leaf, x, -0.88, 0.85).scale.set(1, 0.9, 1);
    }

    /* ---------------- Randevu karoları ---------------- */
    const tileGeometry = track(new RoundedBoxGeometry(0.86, 0.86, 0.16, 5, 0.14));
    const barGeometry = track(new RoundedBoxGeometry(0.48, 0.09, 0.05, 3, 0.04));
    const dotGeometry = track(new THREE.SphereGeometry(0.07, 24, 24));
    const tealTile = track(new THREE.MeshPhysicalMaterial({ color: 0x14b8a6, metalness: 0.1, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }));
    const glowTeal = track(new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x2dd4bf, emissiveIntensity: 2.2 }));
    const glowGold = track(new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xf5b544, emissiveIntensity: 2.2 }));
    const glowSoft = track(new THREE.MeshStandardMaterial({ color: 0xe6fffb, emissive: 0xccfbf1, emissiveIntensity: 0.8 }));

    const orbit = new THREE.Group();
    stage.add(orbit);
    const tileItems = Array.from({ length: tiles }, (_, i) => {
      const isTeal = i % 3 === 0;
      const tile = new THREE.Group();
      tile.add(new THREE.Mesh(tileGeometry, isTeal ? tealTile : dark));
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
      // Dar kapta dükkân küçülür ki yörünge sığsın.
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

      // Cephe hep görünsün diye tam tur değil, salınım.
      shop.rotation.y = 0.15 + Math.sin(t * 0.45) * 0.5;
      shop.position.y = Math.sin(t * 0.9) * 0.06;
      hanger.rotation.z = Math.sin(t * 1.6) * 0.16;
      hanger.rotation.x = Math.sin(t * 1.1) * 0.05;

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
    requestAnimationFrame(() => (renderer.domElement.style.opacity = "1"));

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

/** Kanvasa çizilen doku (tabela, vitrin, levha). */
function drawTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
