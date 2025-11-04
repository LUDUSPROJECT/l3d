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
        this.objects = []; // Lista de objetos selecionáveis
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        
        // NOVO: Lista para tokens que devem encarar a câmera
        this.billboardTokens = [];
        // NOVO: Vetor temporário para otimização no loop
        this.tempVec3 = new THREE.Vector3();

        // --- Loaders ---
        this.gltfLoader = new GLTFLoader();
        // NOVO: Loader para texturas de token
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

        // NOVO: Importador de Token 2D (Imagem)
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
                URL.revokeObjectURL(url);
            },
            undefined, 
            (error) => {
                console.error('Erro ao carregar o modelo GLB.', error);
                URL.revokeObjectURL(url);
            }
        );
    }

    // NOVO: Método para importar tokens de imagem
    handleImageImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);

        this.textureLoader.load(url, (texture) => {
            // Define o aspect ratio (proporção) do token baseado na imagem
            const aspect = texture.image.width / texture.image.height;
            const height = 1.7; // Altura padrão (ex: 1.70m)
            const width = height * aspect;

            // Cria o plano
            const geometry = new THREE.PlaneGeometry(width, height);
            
            // Cria o material.
            // 'transparent: true' é crucial para PNGs
            // 'side: THREE.DoubleSide' garante que seja visível de trás
            const material = new THREE.MeshStandardMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide,
                alphaTest: 0.1 // Evita bordas transparentes "clicáveis"
            });

            const token = new THREE.Mesh(geometry, material);
            
            // Posiciona o token de pé no grid (metade da altura para cima)
            token.position.y = height / 2;

            this.scene.add(token);
            this.objects.push(token); // Adiciona aos selecionáveis
            this.billboardTokens.push(token); // Adiciona aos que giram
            this.transformControls.attach(token);

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
            
            // Lógica para encontrar o objeto raiz (raiz)
            while (selectedObject.parent && selectedObject.parent !== this.scene) {
                if (this.objects.includes(selectedObject.parent)) {
                    selectedObject = selectedObject.parent;
                    break;
                }
                selectedObject = selectedObject.parent;
            }

            // Garante que estamos selecionando o objeto raiz que está na lista
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

    // NOVO: Método para atualizar a rotação dos tokens
    updateBillboards() {
        for (const token of this.billboardTokens) {
            // 1. Copia a posição da câmera
            this.tempVec3.copy(this.camera.position);
            
            // 2. Força o Y (altura) do alvo a ser o mesmo Y do token
            // Esta é a lógica chave que impede a inclinação vertical.
            this.tempVec3.y = token.position.y;
            
            // 3. Faz o token "olhar" para a posição horizontal da câmera
            token.lookAt(this.tempVec3);
        }
    }

    animate() {
        requestAnimationFrame(this.animate);
        
        this.orbitControls.update();
        
        // NOVO: Atualiza os tokens antes de renderizar
        this.updateBillboards(); 
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Inicializa a aplicação
new WebApp3D();
