import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

class WebApp3D {
    constructor() {
        // Elementos do DOM
        this.canvas = document.getElementById('webgl-canvas');
        
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
        
        // --- SOMBRAS (Passo 1: Habilitar no Renderer) ---
        this.renderer.shadowMap.enabled = true;
        // Algoritmo para suavizar as bordas das sombras
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; 

        // --- Luzes ---
        // Luz ambiente mais fraca para sombras mais pronunciadas
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);

        // Luz direcional (sol) mais forte
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(5, 10, 7.5); // Posição mais alta
        
        // --- SOMBRAS (Passo 2: Configurar a Luz) ---
        directionalLight.castShadow = true; 
        
        // Ajusta a resolução do mapa de sombra (padrão é 512)
        directionalLight.shadow.mapSize.width = 2048; 
        directionalLight.shadow.mapSize.height = 2048;

        // Ajusta a "câmera" da sombra (frustum) para cobrir a área do grid
        directionalLight.shadow.camera.left = -10;
        directionalLight.shadow.camera.right = 10;
        directionalLight.shadow.camera.top = 10;
        directionalLight.shadow.camera.bottom = -10;
        
        // **O PONTO CRÍTICO para evitar "hashuras" (shadow acne)**
        // Um pequeno bias negativo "empurra" a sombra do objeto.
        directionalLight.shadow.bias = -0.0005; 
        directionalLight.shadow.normalBias = 0.01; // Ajuste baseado na normal (evita acne em superfícies curvas)

        this.scene.add(directionalLight);
        
        // Helper para visualizar a câmera da sombra (descomente para depurar)
        // const shadowCamHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
        // this.scene.add(shadowCamHelper);

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
        
        // --- SOMBRAS (Passo 3: Adicionar o Chão) ---
        // O GridHelper não recebe sombras, então adicionamos um plano.
        const groundGeometry = new THREE.PlaneGeometry(10, 10);
        // Usamos ShadowMaterial para um chão "invisível" que apenas recebe sombras
        const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.5 }); 
        
        const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        groundPlane.rotation.x = -Math.PI / 2; // Deita o plano
        groundPlane.position.y = -0.01; // Um pouco abaixo do grid
        groundPlane.receiveShadow = true; // **Obrigatório**
        this.scene.add(groundPlane);
        
        // --- Gerenciamento de Objetos ---
        this.objects = []; 
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        
        this.billboardTokens = [];
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
        this.setupEventListeners();

        // Iniciar loop
        this.animate();
    }

    addInitialObject() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.y = 0.5;
        
        // ATUALIZADO (SOMBRAS)
        cube.castShadow = true;
        cube.receiveShadow = true; // O cubo pode receber sombra de outros objetos

        this.scene.add(cube);
        
        this.objects.push(cube);
        this.transformControls.attach(cube);
        this.orbitControls.target.copy(cube.position);
    }

    setupEventListeners() {
        window.addEventListener('resize', this.onResize);
        
        // Eventos do Gizmo
        document.getElementById('btn-translate').addEventListener('click', () => this.transformControls.setMode('translate'));
        document.getElementById('btn-rotate').addEventListener('click', () => this.transformControls.setMode('rotate'));
        document.getElementById('btn-scale').addEventListener('click', () => this.transformControls.setMode('scale'));

        // Atalhos de Teclado (W, E, R)
        window.addEventListener('keydown', (event) => {
            switch (event.key.toLowerCase()) {
                case 'w':
                    this.transformControls.setMode('translate');
                    break;
                case 'e':
                    this.transformControls.setMode('rotate');
                    break;
                case 'r':
                    this.transformControls.setMode('scale');
                    break;
            }
        });

        // Importador de Modelo 3D (GLB)
        document.getElementById('fileInput').addEventListener('change', (event) => {
            this.handleGLBImport(event);
        });

        // Importador de Token 2D (Imagem)
        document.getElementById('imageInput').addEventListener('change', (event) => {
            this.handleImageImport(event);
        });
        
        // Seleção de Objeto (Clique)
        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    }

    handleGLBImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        
        this.gltfLoader.load(url, 
            (gltf) => {
                const model = gltf.scene;
                
                // ATUALIZADO (SOMBRAS): Habilita sombras para todo o modelo
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
            
            // ATUALIZADO (SOMBRAS)
            token.castShadow = true;
            // É melhor não receber sombra (receiveShadow = false) em um plano 2D,
            // pois pode parecer estranho. Apenas projetar sombra já "ancora" ele.

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

    onPointerDown(event) {
        if (this.transformControls.dragging) return;
        
        this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.camera);
        
        const intersects = this.raycaster.intersectObjects(this.objects, true);

        if (intersects.length > 0) {
            let selectedObject = intersects[0].object;
            
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
            this.transformControls.detach();
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    updateBillboards() {
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
            
            // Preserva a rotação X/Z do gizmo
            token.rotation.y = angle;
        }
    }

    animate() {
        requestAnimationFrame(this.animate);
        
        this.orbitControls.update();
        this.updateBillboards(); 
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Inicializa a aplicação
new WebApp3D();
