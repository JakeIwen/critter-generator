import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function mountViewer(element, mesh, height) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#202820', 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  element.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Rotatable 3D preview of the exported printable sculpture. Drag to rotate; scroll to zoom.');
  renderer.domElement.setAttribute('role', 'img');
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#202820', height * 4, height * 9);
  const camera = new THREE.PerspectiveCamera(34, 1, .1, height * 15);
  camera.up.set(0, 0, 1);
  camera.position.set(height * 1.8, -height * 2.65, height * 1.65);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, height * .43);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = height * 1.35; controls.maxDistance = height * 6;
  controls.maxPolarAngle = Math.PI * .49;
  controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotateSpeed = .45;
  controls.saveState();
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  scene.add(new THREE.HemisphereLight(0xf1ead2, 0x324036, 2.5));
  const light = new THREE.DirectionalLight(0xffe4b2, 4.5);
  light.position.set(-height, -height, height * 2.5); light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -height*2, right: height*2, top: height*2, bottom: -height*2, near: 1, far: height*7 });
  light.shadow.bias = -.0003; scene.add(light);
  const rim = new THREE.DirectionalLight(0xb7cea3, 3); rim.position.set(height, height, height); scene.add(rim);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  geometry.setIndex(mesh.triangles); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: '#bfbd96', roughness: .65, metalness: .13 });
  const sculpt = new THREE.Mesh(geometry, material); sculpt.castShadow = true; sculpt.receiveShadow = true; scene.add(sculpt);
  const groundGeometry = new THREE.PlaneGeometry(height * 30, height * 30);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: '#242c23', roughness: 1 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial); ground.position.z = -.1; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(height * 6, 30, '#627052', '#3b4737');
  grid.rotation.x = Math.PI / 2; grid.position.z = -.05; grid.material.transparent = true; grid.material.opacity = .26; scene.add(grid);
  const resize = () => {
    const { width, height: h } = element.getBoundingClientRect();
    if (!width || !h) return;
    renderer.setSize(width, h); camera.aspect = width / h; camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(element); resize();
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
  return {
    reset() { controls.reset(); },
    screenshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    dispose() {
      renderer.setAnimationLoop(null); observer.disconnect(); controls.dispose();
      geometry.dispose(); material.dispose(); groundGeometry.dispose(); groundMaterial.dispose(); grid.geometry.dispose(); grid.material.dispose();
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
