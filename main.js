import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

class WebApp3D {
    constructor() {
        // --- Elementos do DOM ---
        this.canvas = document.getElementById('webgl-canvas');
        // NOVO: UI de Edição de Luz
        this.lightEditorPanel = document.getElementById('light-editor-panel');
        this.lightColorPicker = document.getElementById('light-color-picker');

        // --- Setup Básico ---
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x333333);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(5, 5, 5);

        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.canvas,
            antialias: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Configuração de Sombras
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; 

        // --- Luzes ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);

        // Luz Direcional (Sol)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(5, 10, 7.5); 
        directionalLight.castShadow = true; 
        directionalLight.shadow.mapSize.width = 2048; 
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.left = -10;
        directionalLight.shadow.camera.right = 10;
        directionalLight.shadow.camera.top = 10;
        directionalLight.shadow.camera.bottom = -10;
        directionalLight.shadow.bias = -0.0005; 
        directionalLight.shadow.normalBias = 0.01;
        this.scene.add(directionalLight);
        // Não adicionamos a luz direcional ao array de 'luzes selecionáveis'
        
        // --- Controles de Câmera (Navegação) ---
        this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
        this.orbitControls.enableDamping = true;

        // --- Controles de Transformação (Gizmo) ---
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        this.scene.add(this.transformControls);

        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.orbitControls.enabled = !event.value;
        });

        // --- Helpers ---
        this.scene.add(new THREE.GridHelper(10, 10));
        
        // Chão para Sombras
        const groundGeometry = new THREE.PlaneGeometry(10, 10);
        const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.5 }); 
        const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        groundPlane.rotation.x = -Math.PI / 2; 
        groundPlane.position.y = -0.01; 
        groundPlane.receiveShadow = true; 
        this.scene.add(groundPlane);
        
        // --- Gerenciamento de Objetos ---
        this.objects = []; // Meshes (Cubos, Modelos, Tokens)
        this.billboardTokens = [];
        
        // NOVO: Arrays para luzes dinâmicas e seus helpers
        this.lights = [];
        this.lightHelpers = [];
        
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        
        this.tempVec3 = new THREE.Vector3(); 
        this.cameraTargetVec = new THREE.Vector3();

        // --- Loaders ---
        this.gltfLoader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();

        // Adicionar um objeto inicial (Cubo)
        this.addInitialObject();

        // Bind 'this' para métodos de evento
        this.onResize = this.onResize.bind(this);
        this.animate = this.animate.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        
        // NOVO: Binds para novas funções
        this.addPointLight = this.addPointLight.bind(this);
        this.addSpotLight = this.addSpotLight.bind(this);
        this.onGizmoObjectChange = this.onGizmoObjectChange.bind(this);
        this.updateSelectedLightColor = this.updateSelectedLightColor.bind(this);

        this.setupEventListeners();

        // Iniciar loop
        this.animate();
    }

    addInitialObject() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.y = 0.5;
        cube.castShadow = true;
        cube.receiveShadow = true; 
        this.scene.add(cube);
        
        this.objects.push(cube);
        this.transformControls.attach(cube);
        this.orbitControls.target.copy(cube.position);
    }

    setupEventListeners() {
        window.addEventListener('resize', this.onResize);
        
        // --- Eventos do Gizmo ---
        document.getElementById('btn-translate').addEventListener('click', () => this.transformControls.setMode('translate'));
        document.getElementById('btn-rotate').addEventListener('click', () => this.transformControls.setMode('rotate'));
        document.getElementById('btn-scale').addEventListener('click', () => this.transformControls.setMode('scale'));

        // --- Atalhos de Teclado (W, E, R, P, L) ---
        window.addEventListener('keydown', (event) => {
            // Não acionar atalhos se estiver digitando em um input (como o de cor)
            if (event.target.tagName.toLowerCase() === 'input') return;

            switch (event.key.toLowerCase()) {
                case 'w': this.transformControls.setMode('translate'); break;
                case 'e': this.transformControls.setMode('rotate'); break;
                case 'r': this.transformControls.setMode('scale'); break;
                case 'p': this.addPointLight(); break; // NOVO: Atalho P
                case 'l': this.addSpotLight(); break; // NOVO: Atalho L
            }
        });

        // --- Importadores ---
        document.getElementById('fileInput').addEventListener('change', (event) => this.handleGLBImport(event));
        document.getElementById('imageInput').addEventListener('change', (event) => this.handleImageImport(event));
        
        // --- Seleção de Objeto (Clique) ---
        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);

        // --- NOVO: Listeners de Luz ---
        document.getElementById('btn-add-pointlight').addEventListener('click', this.addPointLight);
        document.getElementById('btn-add-spotlight').addEventListener('click', this.addSpotLight);

        // --- NOVO: Listener de mudança no seletor de cor ---
        this.lightColorPicker.addEventListener('input', this.updateSelectedLightColor);

        // --- NOVO: Listener de mudança de objeto no Gizmo ---
        // Este é o ponto central para exibir/ocultar a UI de edição
        this.transformControls.addEventListener('objectChange', this.onGizGobjectChange);
    }

    // --- NOVO: Adiciona PointLight ---
    addPointLight() {
        const light = new THREE.PointLight(0xffffff, 1, 10); // Cor, Intensidade, Distância
        light.position.set(0, 2, 0); // Posição inicial
        light.castShadow = true;
        light.shadow.bias = -0.001; // Bias para point lights
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;
        
        const helper = new THREE.PointLightHelper(light, 0.5); // Raio do helper
        
        this.scene.add(light);
        this.scene.add(helper);
        this.lights.push(light);
        this.lightHelpers.push(helper);
        
        this.transformControls.attach(light); // Seleciona a nova luz
    }

    // --- NOVO: Adiciona SpotLight ---
    addSpotLight() {
        const light = new THREE.SpotLight(0xffffff, 1.5, 20, Math.PI / 6, 0.2); // Cor, Int, Dist, Ângulo, Penumbra
        light.position.set(0, 3, 0);
        light.target.position.set(0, 0, 0); // O alvo padrão é (0,0,0)
        
        light.castShadow = true;
        light.shadow.bias = -0.001;
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;

        // O helper do SpotLight precisa da luz E seu alvo
        const helper = new THREE.SpotLightHelper(light);
        
        this.scene.add(light);
        this.scene.add(light.target); // Importante: adicionar o alvo à cena
        this.scene.add(helper);
        this.lights.push(light);
        this.lightHelpers.push(helper);

        this.transformControls.attach(light); // Seleciona a nova luz
    }

    // --- NOVO: Atualiza cor da luz selecionada ---
    updateSelectedLightColor() {
        const selectedObject = this.transformControls.object;
        if (selectedObject && (selectedObject.isPointLight || selectedObject.isSpotLight)) {
            selectedObject.color.set(this.lightColorPicker.value);
        }
    }

    // --- NOVO: Controla a visibilidade do painel de edição ---
    onGizmoObjectChange() {
        const selectedObject = this.transformControls.object;
        
        if (selectedObject && (selectedObject.isPointLight || selectedObject.isSpotLight)) {
            // Objeto selecionado é uma luz
            this.lightEditorPanel.classList.remove('hidden');
            // Sincroniza o seletor com a cor da luz
            this.lightColorPicker.value = `#${selectedObject.color.getHexString()}`;
        } else {
            // Objeto não é uma luz (ou nada selecionado)
            this.lightEditorPanel.classList.add('hidden');
        }
    }

    handleGLBImport(event) {
        // ... (código inalterado)
        const file = event.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        
        this.gltfLoader.load(url, 
            (gltf) => {
                const model = gltf.scene;
                
                model.traverse((node) => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                    }
                });

                this.scene.add(model);
                this.objects.push(model); 
                this.transformControls.attach(model);
                
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                this.orbitControls.target.copy(center);
                
                URL.revokeObjectURL(url);
            },
            undefined, 
            (error) => {
                console.error('Erro ao carregar o modelo GLB.', error);
                URL.revokeObjectURL(url);
            }
        );
    }

    handleImageImport(event) {
        // ... (código inalterado)
        const file = event.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);

        this.textureLoader.load(url, (texture) => {
            const aspect = texture.image.width / texture.image.height;
            const height = 1.7; 
            const width = height * aspect;

            const geometry = new THREE.PlaneGeometry(width, height);
            const material = new THREE.MeshStandardMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide,
                alphaTest: 0.1 
            });

            const token = new THREE.Mesh(geometry, material);
            token.position.y = height / 2;
            token.castShadow = true;

            this.scene.add(token);
            this.objects.push(token); 
            this.billboardTokens.push(token); 
            this.transformControls.attach(token);

            this.orbitControls.target.copy(token.position);

            URL.revokeObjectURL(url);
        },
        undefined,
        (error) => {
            console.error('Erro ao carregar a imagem do token.', error);
            URL.revokeObjectURL(url);
        });
    }

    // --- ATUALIZADO: onPointerDown agora verifica Meshes E Helpers ---
    onPointerDown(event) {
        if (this.transformControls.dragging) return;
        
        this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.camera);
        
        // --- Raycast em duas etapas ---
        // 1. Verificar se clicamos em um helper de luz
        const intersectsHelpers = this.raycaster.intersectObjects(this.lightHelpers, true);
        if (intersectsHelpers.length > 0) {
            // O helper tem uma referência '.light' para a luz real
            const selectedLight = intersectsHelpers[0].object.light;
            if (selectedLight) {
                this.transformControls.attach(selectedLight);
                return; // Encontramos, não precisamos verificar meshes
            }
        }

        // 2. Se não, verificar se clicamos em um mesh (modelo, token, cubo)
        const intersectsMeshes = this.raycaster.intersectObjects(this.objects, true);
        if (intersectsMeshes.length > 0) {
            let selectedObject = intersectsMeshes[0].object;
            
            while (selectedObject.parent && selectedObject.parent !== this.scene) {
                if (this.objects.includes(selectedObject.parent)) {
                    selectedObject = selectedObject.parent;
                    break;
                }
                selectedObject = selectedObject.parent;
            }

            if (this.objects.includes(selectedObject)) {
                this.transformControls.attach(selectedObject);
            }
        } else {
            // Clicou fora de tudo
            this.transformControls.detach();
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    updateBillboards() {
        // ... (código inalterado)
        this.cameraTargetVec.set(
            this.camera.position.x, 
            0, 
            this.camera.position.z
        );

        for (const token of this.billboardTokens) {
            if (this.transformControls.dragging &&
                this.transformControls.object === token &&
                this.transformControls.mode === 'rotate') {
                continue;
            }

            this.tempVec3.set(token.position.x, 0, token.position.z);
            this.tempVec3.sub(this.cameraTargetVec); 
            const angle = Math.atan2(this.tempVec3.x, this.tempVec3.z) + Math.PI;
            
            token.rotation.y = angle;
        }
    }

    animate() {
        requestAnimationFrame(this.animate);
        
        this.orbitControls.update();
        this.updateBillboards(); 
        
        // NOVO: Atualizar helpers de luz (especialmente SpotLight)
        for (const helper of this.lightHelpers) {
            helper.update();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Inicializa a aplicação
new WebApp3D();
