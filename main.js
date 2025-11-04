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

        // Desabilitar OrbitControls ao usar TransformControls
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.orbitControls.enabled = !event.value;
        });

        // --- Helpers ---
        this.scene.add(new THREE.GridHelper(10, 10));
        
        // --- Gerenciamento de Objetos ---
        this.objects = []; // Lista de objetos que podem ser selecionados
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

        // --- Loaders ---
        this.gltfLoader = new GLTFLoader();

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
        
        // Adiciona à lista de selecionáveis e anexa o gizmo
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

        // Importador de Arquivos
        document.getElementById('fileInput').addEventListener('change', (event) => {
            this.handleFileImport(event);
        });
        
        // Seleção de Objeto (Clique)
        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    }

    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        
        this.gltfLoader.load(url, 
            (gltf) => {
                const model = gltf.scene;
                this.scene.add(model);
                this.objects.push(model); // Adiciona o grupo do modelo à lista de selecionáveis
                this.transformControls.attach(model); // Anexa o gizmo ao novo modelo
                URL.revokeObjectURL(url); // Libera memória
            },
            undefined, // onProgress (opcional)
            (error) => {
                console.error('Erro ao carregar o modelo GLB.', error);
                URL.revokeObjectURL(url);
            }
        );
    }

    onPointerDown(event) {
        // Se estivermos usando o gizmo, não acione o raycaster
        if (this.transformControls.dragging) return;
        
        // Calcula a posição do ponteiro em coordenadas normalizadas (-1 a +1)
        this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.camera);
        
        // Verifica interseções (recursive 'true' para checar filhos dos modelos)
        const intersects = this.raycaster.intersectObjects(this.objects, true);

        if (intersects.length > 0) {
            // Lógica para encontrar o objeto pai (raiz) que está na lista 'this.objects'
            let selectedObject = intersects[0].object;
            while (selectedObject.parent && selectedObject.parent !== this.scene) {
                if (this.objects.includes(selectedObject.parent)) {
                    selectedObject = selectedObject.parent;
                    break;
                }
                selectedObject = selectedObject.parent;
            }

            // Anexa o gizmo ao objeto raiz selecionado
            this.transformControls.attach(selectedObject);
            
        } else {
            // Desanexa o gizmo se clicar fora
            this.transformControls.detach();
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(this.animate);
        
        this.orbitControls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// Inicializa a aplicação
new WebApp3D();