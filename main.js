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

        // --- Luzes ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(2, 5, 5);
        this.scene.add(directionalLight);

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
        
        // --- Gerenciamento de Objetos ---
        this.objects = []; 
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        
        this.billboardTokens = [];
        
        // Vetores temporários para otimização
        this.tempVec3 = new THREE.Vector3(); // Para lookAt
        this.cameraTargetVec = new THREE.Vector3(); // Para cálculo de ângulo

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
        this.scene.add(cube);
        
        this.objects.push(cube);
        this.transformControls.attach(cube);
        
        // Foca a câmera no objeto inicial
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
                this.scene.add(model);
                this.objects.push(model); 
                this.transformControls.attach(model);
                
                // **MELHORIA:** Foca a câmera no novo objeto
                // (Calcula o centro do modelo para um foco mais preciso, se houver)
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
            const height = 1.7; // Altura padrão
            const width = height * aspect;

            const geometry = new THREE.PlaneGeometry(width, height);
            const material = new THREE.MeshStandardMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide,
                alphaTest: 0.1 
            });

            const token = new THREE.Mesh(geometry, material);
            
            // Posiciona o token de pé no grid
            token.position.y = height / 2;

            this.scene.add(token);
            this.objects.push(token); 
            this.billboardTokens.push(token); 
            this.transformControls.attach(token);

            // **MELHORIA:** Foca a câmera no novo token
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

    // **LÓGICA DE BILLBOARDING ATUALIZADA**
    updateBillboards() {
        // Obtém a posição da câmera e a projeta no plano XZ
        this.cameraTargetVec.set(
            this.camera.position.x, 
            0, // Ignora a altura da câmera
            this.camera.position.z
        );

        for (const token of this.billboardTokens) {
            // Se o gizmo estiver rotacionando o token, não faça nada.
            // Isso permite que o usuário o rotacione (ex: em X) se quiser.
            if (this.transformControls.dragging &&
                this.transformControls.object === token &&
                this.transformControls.mode === 'rotate') {
                continue;
            }

            // Obtém a posição do token e a projeta no plano XZ
            this.tempVec3.set(token.position.x, 0, token.position.z);
            
            // Calcula o vetor (direção) do token para a câmera no plano XZ
            this.tempVec3.sub(this.cameraTargetVec); // Vetor da câmera para o token

            // Calcula o ângulo em radianos usando atan2
            // O eixo +Z do 'Plane' aponta para nós por padrão, então adicionamos PI (180 graus)
            // para fazer a 'frente' do plano (a textura) encarar a câmera.
            const angle = Math.atan2(this.tempVec3.x, this.tempVec3.z) + Math.PI;

            // Aplica a rotação APENAS no eixo Y.
            // As rotações X e Z (controladas pelo gizmo) são preservadas.
            token.rotation.y = angle;
        }
    }

    animate() {
        requestAnimationFrame(this.animate);
        
        this.orbitControls.update();
        
        // Atualiza os tokens antes de renderizar
        this.updateBillboards(); 
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Inicializa a aplicação
new WebApp3D();
