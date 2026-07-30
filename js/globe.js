/* ===== 3D Globe Module - Three.js ===== */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const Globe = (() => {
    let scene, camera, renderer, controls, earth, atmosphere, starsGroup;
    let shipMarkers = new Map();
    let routeLines = [];
    let cloudsGroup;
    let animationId;
    let clock = new THREE.Clock();
    let isInitialized = false;
    let onShipClick = null;
    let raycaster, mouse;

    const SHIP_TYPE_COLORS = {
        70: 0x00d4ff, // Cargo
        80: 0xf59e0b, // Tanker
        30: 0x10b981, // Fishing
        60: 0x8b5cf6, // Passenger
        90: 0x94a3b8, // Other
        default: 0x00d4ff
    };

    function getShipColor(type) {
        return SHIP_TYPE_COLORS[type] || SHIP_TYPE_COLORS.default;
    }

    function init(container, canvas) {
        if (isInitialized) return;

        // Scene
        scene = new THREE.Scene();

        // Camera
        camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.set(0, 1.5, 5);
        camera.lookAt(0, 0, 0);

        // Renderer
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.8;

        // Controls
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 2;
        controls.maxDistance = 10;
        controls.maxPolarAngle = Math.PI;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.15;
        controls.target.set(0, 0, 0);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x333366, 1.5);
        scene.add(ambientLight);
        const sunLight = new THREE.DirectionalLight(0xffffff, 2);
        sunLight.position.set(5, 2, 5);
        scene.add(sunLight);

        // Stars background
        createStars();

        // Earth
        createEarth();

        // Atmosphere
        createAtmosphere();

        // Clouds
        createClouds();

        // Raycaster for interaction
        raycaster = new THREE.Raycaster();
        raycaster.params.Points.threshold = 0.1;
        mouse = new THREE.Vector2();

        // Resize handler
        window.addEventListener('resize', () => {
            if (!container) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        });

        // Click handler
        renderer.domElement.addEventListener('click', handleGlobeClick);

        // Start animation
        isInitialized = true;
        animate();
    }

    function createStars() {
        starsGroup = new THREE.Group();
        const starsGeo = new THREE.BufferGeometry();
        const starsCount = 2000;
        const positions = new Float32Array(starsCount * 3);
        for (let i = 0; i < starsCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 50 + Math.random() * 50;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
        }
        starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starsMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.08,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const stars = new THREE.Points(starsGeo, starsMat);
        starsGroup.add(stars);
        scene.add(starsGroup);
    }

    function createEarth() {
        // Earth group
        const earthGroup = new THREE.Group();

        // Earth sphere with procedural texture
        const earthGeo = new THREE.SphereGeometry(1, 128, 128);

        // Create procedural earth texture using canvas
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        // Ocean gradient
        const oceanGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        oceanGrad.addColorStop(0, '#1a3a5c');
        oceanGrad.addColorStop(0.3, '#1e5080');
        oceanGrad.addColorStop(0.5, '#1a5c8a');
        oceanGrad.addColorStop(0.7, '#1e5080');
        oceanGrad.addColorStop(1, '#1a3a5c');
        ctx.fillStyle = oceanGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw simplified continent shapes
        ctx.fillStyle = '#1a472a';
        // North America
        ctx.beginPath();
        ctx.ellipse(400, 300, 250, 350, -0.2, 0, Math.PI * 2);
        ctx.fill();
        // South America
        ctx.beginPath();
        ctx.ellipse(450, 600, 80, 180, 0.1, 0, Math.PI * 2);
        ctx.fill();
        // Europe
        ctx.beginPath();
        ctx.ellipse(980, 250, 120, 180, 0, 0, Math.PI * 2);
        ctx.fill();
        // Africa
        ctx.beginPath();
        ctx.ellipse(980, 550, 100, 250, 0, 0, Math.PI * 2);
        ctx.fill();
        // Asia
        ctx.beginPath();
        ctx.ellipse(1300, 280, 300, 300, 0, 0, Math.PI * 2);
        ctx.fill();
        // Southeast Asia / Indonesia
        ctx.beginPath();
        ctx.ellipse(1450, 500, 80, 60, 0.5, 0, Math.PI * 2);
        ctx.fill();
        // Australia
        ctx.beginPath();
        ctx.ellipse(1500, 650, 90, 70, 0, 0, Math.PI * 2);
        ctx.fill();
        // China highlighted
        ctx.fillStyle = '#2d6a3f';
        ctx.beginPath();
        ctx.ellipse(1350, 330, 100, 80, 0, 0, Math.PI * 2);
        ctx.fill();

        // Grid lines (latitude/longitude)
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 18; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * canvas.height / 18);
            ctx.lineTo(canvas.width, i * canvas.height / 18);
            ctx.stroke();
        }
        for (let i = 1; i < 36; i++) {
            ctx.beginPath();
            ctx.moveTo(i * canvas.width / 36, 0);
            ctx.lineTo(i * canvas.width / 36, canvas.height);
            ctx.stroke();
        }

        const earthTexture = new THREE.CanvasTexture(canvas);
        earthTexture.colorSpace = THREE.SRGBColorSpace;

        const earthMat = new THREE.MeshStandardMaterial({
            map: earthTexture,
            roughness: 0.7,
            metalness: 0.05,
            color: 0xcccccc
        });

        earth = new THREE.Mesh(earthGeo, earthMat);
        earthGroup.add(earth);

        // Bump/detail overlay
        const bumpCanvas = document.createElement('canvas');
        bumpCanvas.width = 1024;
        bumpCanvas.height = 512;
        const bctx = bumpCanvas.getContext('2d');
        bctx.fillStyle = '#808080';
        bctx.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);
        // Add noise for terrain
        for (let i = 0; i < 5000; i++) {
            const x = Math.random() * bumpCanvas.width;
            const y = Math.random() * bumpCanvas.height;
            const brightness = 100 + Math.random() * 55;
            bctx.fillStyle = `rgb(${brightness},${brightness},${brightness})`;
            bctx.fillRect(x, y, 3, 3);
        }

        const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
        earthMat.bumpMap = bumpTexture;
        earthMat.bumpScale = 0.02;

        scene.add(earthGroup);
    }

    function createAtmosphere() {
        const atmosGeo = new THREE.SphereGeometry(1.03, 64, 64);
        const atmosMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color('#00d4ff') }
            },
            vertexShader: /* glsl */`
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPos.xyz;
                    vNormal = normalize(mat3(modelMatrix) * normal);
                    vPosition = position;
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: /* glsl */`
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vWorldPosition;
                uniform float uTime;
                uniform vec3 uColor;
                void main() {
                    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                    float fresnel = 1.0 - abs(dot(viewDir, vNormal));
                    fresnel = pow(fresnel, 3.5);
                    float alpha = fresnel * 0.4;
                    gl_FragColor = vec4(uColor, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.FrontSide
        });
        atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
        scene.add(atmosphere);
    }

    function createClouds() {
        cloudsGroup = new THREE.Group();
        const cloudsGeo = new THREE.SphereGeometry(1.01, 64, 64);

        // Procedural clouds
        const cloudCanvas = document.createElement('canvas');
        cloudCanvas.width = 1024;
        cloudCanvas.height = 512;
        const cctx = cloudCanvas.getContext('2d');
        cctx.fillStyle = 'rgba(0,0,0,0)';
        cctx.fillRect(0, 0, cloudCanvas.width, cloudCanvas.height);

        for (let i = 0; i < 3000; i++) {
            const x = Math.random() * cloudCanvas.width;
            const y = Math.random() * cloudCanvas.height;
            const r = 2 + Math.random() * 8;
            const alpha = Math.random() * 0.3;
            cctx.fillStyle = `rgba(255,255,255,${alpha})`;
            cctx.beginPath();
            cctx.ellipse(x, y, r, r * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
            cctx.fill();
        }

        const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
        const cloudsMat = new THREE.MeshStandardMaterial({
            map: cloudTexture,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const clouds = new THREE.Mesh(cloudsGeo, cloudsMat);
        cloudsGroup.add(clouds);
        scene.add(cloudsGroup);
    }

    function latLngToVec3(lat, lng, radius = 1) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lng + 180) * Math.PI / 180;
        const x = -radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);
        return new THREE.Vector3(x, y, z);
    }

    function addShipMarker(id, lat, lng, shipType = 70, onClick = null) {
        // Remove existing marker
        removeShipMarker(id);

        const color = getShipColor(shipType);
        const position = latLngToVec3(lat, lng, 1.015);

        // Create marker group
        const markerGroup = new THREE.Group();
        markerGroup.position.copy(position);

        // Glowing dot (main marker)
        const dotGeo = new THREE.SphereGeometry(0.008, 8, 8);
        const dotMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        markerGroup.add(dot);

        // Outer ring (pulse effect)
        const ringGeo = new THREE.RingGeometry(0.012, 0.016, 16);
        const ringMat = new THREE.MeshBasicMaterial({
            color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.lookAt(new THREE.Vector3(0, 0, 0));
        markerGroup.add(ring);

        // Vertical line (pole indicator)
        const vertLineGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.03, 4);
        const vertLineMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
        const vertLine = new THREE.Mesh(vertLineGeo, vertLineMat);
        vertLine.position.y = 0.015;
        markerGroup.add(vertLine);

        // Glow sprite
        const spriteTexture = createGlowTexture(color);
        const spriteMat = new THREE.SpriteMaterial({
            map: spriteTexture,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            depthTest: true
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(0.05, 0.05, 1);
        markerGroup.add(sprite);

        markerGroup.userData = { id, lat, lng, shipType, color, onClick };
        scene.add(markerGroup);
        shipMarkers.set(id, markerGroup);

        return markerGroup;
    }

    function createGlowTexture(color) {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const hexColor = '#' + new THREE.Color(color).getHexString();

        const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        gradient.addColorStop(0, hexColor);
        gradient.addColorStop(0.1, hexColor + 'cc');
        gradient.addColorStop(0.3, hexColor + '66');
        gradient.addColorStop(0.6, hexColor + '11');
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        return new THREE.CanvasTexture(canvas);
    }

    function removeShipMarker(id) {
        const marker = shipMarkers.get(id);
        if (marker) {
            scene.remove(marker);
            marker.traverse(child => {
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
                if (child.geometry) child.geometry.dispose();
            });
            shipMarkers.delete(id);
        }
    }

    function clearAllMarkers() {
        for (const id of shipMarkers.keys()) {
            removeShipMarker(id);
        }
    }

    function addRouteLine(waypoints, color = 0x00d4ff) {
        const points = waypoints.map(wp => latLngToVec3(wp.lat, wp.lng, 1.02));
        const curve = new THREE.CatmullRomCurve3(points);

        const tubeGeo = new THREE.TubeGeometry(curve, 100, 0.003, 6, false);
        const tubeMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        scene.add(tube);
        routeLines.push(tube);

        // Animated particles along route
        const particleCount = 30;
        const particleGroup = new THREE.Group();

        for (let i = 0; i < particleCount; i++) {
            const pGeo = new THREE.SphereGeometry(0.004, 4, 4);
            const pMat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const particle = new THREE.Mesh(pGeo, pMat);
            particle.userData = { offset: i / particleCount, curve };
            particleGroup.add(particle);
        }
        scene.add(particleGroup);
        routeLines.push({ group: particleGroup, type: 'particles', curve });

        return tube;
    }

    function clearRoutes() {
        routeLines.forEach(line => {
            if (line.type === 'particles') {
                line.group.traverse(child => {
                    if (child.material) child.material.dispose();
                    if (child.geometry) child.geometry.dispose();
                });
            }
            scene.remove(line.group || line);
        });
        routeLines = [];
    }

    function handleGlobeClick(event) {
        if (!onShipClick) return;
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const markerMeshes = [];
        shipMarkers.forEach((group) => {
            group.children.forEach(child => {
                if (child.isMesh && child.geometry.type === 'SphereGeometry') {
                    markerMeshes.push(child);
                }
            });
        });

        const intersects = raycaster.intersectObjects(markerMeshes, true);
        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj && !obj.userData.id) {
                obj = obj.parent;
            }
            if (obj && obj.userData.id && obj.userData.onClick) {
                obj.userData.onClick(obj.userData.id, obj.userData);
            } else if (obj && obj.userData.id && onShipClick) {
                onShipClick(obj.userData.id, obj.userData);
            }
        }
    }

    function setOnShipClick(callback) {
        onShipClick = callback;
    }

    function focusOnLocation(lat, lng, zoom = 3) {
        const target = latLngToVec3(lat, lng, 1);
        controls.target.copy(target);

        const camTarget = latLngToVec3(lat, lng, zoom);
        const dir = camTarget.clone().normalize();
        camera.position.copy(dir.multiplyScalar(zoom));

        controls.update();
    }

    function animate() {
        animationId = requestAnimationFrame(animate);
        const dt = clock.getDelta();
        const elapsed = clock.getElapsedTime();

        controls.update();

        // Rotate clouds slowly
        if (cloudsGroup) {
            cloudsGroup.rotation.y += dt * 0.015;
        }

        // Update atmosphere time
        if (atmosphere && atmosphere.material.uniforms) {
            atmosphere.material.uniforms.uTime.value = elapsed;
        }

        // Animate ship markers (pulse)
        shipMarkers.forEach((group) => {
            const sprite = group.children.find(c => c.isSprite);
            if (sprite) {
                const scale = 0.05 + Math.sin(elapsed * 3 + group.position.x * 10) * 0.01;
                sprite.scale.set(scale, scale, 1);
            }
        });

        // Animate route particles
        routeLines.forEach(line => {
            if (line.type === 'particles' && line.curve) {
                line.group.children.forEach(particle => {
                    const t = (particle.userData.offset + elapsed * 0.1) % 1;
                    const pt = line.curve.getPointAt(t);
                    particle.position.copy(pt);
                });
            }
        });

        // Rotate stars
        if (starsGroup) {
            starsGroup.rotation.y += dt * 0.005;
        }

        renderer.render(scene, camera);
    }

    function dispose() {
        if (animationId) cancelAnimationFrame(animationId);

        clearAllMarkers();
        clearRoutes();

        scene.traverse(child => {
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
            if (child.geometry) child.geometry.dispose();
        });

        if (renderer) renderer.dispose();
        isInitialized = false;
    }

    function resize(width, height) {
        if (renderer) {
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }
    }

    return {
        init,
        dispose,
        resize,
        addShipMarker,
        removeShipMarker,
        clearAllMarkers,
        addRouteLine,
        clearRoutes,
        setOnShipClick,
        focusOnLocation,
        latLngToVec3,
        getShipColor,
        SHIP_TYPE_COLORS
    };
})();

export default Globe;
