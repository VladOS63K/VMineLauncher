class SkinRenderer {
    constructor(container, imageBlob) {
        this.container = container;
        this.imageBlob = imageBlob;
    }

    running = false;
    rendering = false;

    container = null;
    resizeObserver = null;
    imageBlob = null;

    scene = null;

    camera = null;

    renderer = null;

    controls = null;

    dirLight = null;


    // Общая заготовка базового материала, пока нет скина
    defaultMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1.0 });

    // Функция вырезания куска текстуры для конкретной грани
    createFaceMaterial(img, u, v, w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w * 8; // Апскейлим, чтоб не было размытия
        canvas.height = h * 8;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        // Вырезаем пиксели из скина и растягиваем на канвас грани
        ctx.drawImage(img, u, v, w, h, 0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        return new THREE.MeshStandardMaterial({ map: texture, roughness: 1.0, transparent: true, alphaTest: 0.5 });
    }

    // Создаем Стива через 6 материалов на каждый куб (Порядок: Right, Left, Top, Bottom, Front, Back)
    createStevePart(w_px, h_px, d_px, u, v, x, y, z, img = null) {
        const s = 0.0625;
        const geometry = new THREE.BoxGeometry(w_px * s, h_px * s, d_px * s);

        let materials = [];
        if (!img) {
            materials = Array(6).fill(this.defaultMaterial);
        } else {
            materials = [
                this.createFaceMaterial(img, u + d_px + w_px, v + d_px, d_px, h_px), // Right
                this.createFaceMaterial(img, u, v + d_px, d_px, h_px), // Left
                this.createFaceMaterial(img, u + d_px, v, w_px, d_px), // Top
                this.createFaceMaterial(img, u + d_px + w_px, v, w_px, d_px), // Bottom
                this.createFaceMaterial(img, u + d_px, v + d_px, w_px, h_px), // Front
                this.createFaceMaterial(img, u + d_px + w_px + d_px, v + d_px, w_px, h_px)  // Back
            ];
        }

        const mesh = new THREE.Mesh(geometry, materials);
        mesh.position.set(x * s, y * s, z * s);
        return mesh;
    }

    async render() {
        return new Promise((resolve, reject) => {
            this.running = true;
            this.rendering = true;

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.dirLight = new THREE.DirectionalLight(0xffffff, 0.45);

            this.scene.background = new THREE.Color(0x111111);
            this.camera.position.set(0, 1.5, 4.5);
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.container.appendChild(this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.1;
            this.controls.target.set(0, 1.0, 0);
            this.scene.add(new THREE.AmbientLight(0xffffff, 0.95));
            this.dirLight.position.set(2, 5, 3);
            this.scene.add(this.dirLight);

            const img = new Image();
            img.onload = () => {
                let head = this.createStevePart(8, 8, 8, 0, 0, 0, 20, 0, img);
                let body = this.createStevePart(8, 12, 4, 16, 16, 0, 10, 0, img);
                let leftArm = this.createStevePart(4, 12, 4, 32, 48, -6, 10, 0, img);
                let rightArm = this.createStevePart(4, 12, 4, 40, 16, 6, 10, 0, img);
                let leftLeg = this.createStevePart(4, 12, 4, 16, 48, -2, -2, 0, img);
                let rightLeg = this.createStevePart(4, 12, 4, 0, 16, 2, -2, 0, img);

                let steveGroup = new THREE.Group();
                steveGroup.add(head, body, leftArm, rightArm, leftLeg, rightLeg);
                this.scene.add(steveGroup);

                this.resizeObserver = new ResizeObserver(() => {
                    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
                    this.camera.updateProjectionMatrix();
                    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
                });
                this.resizeObserver.observe(this.container);
                this.animate();
                resolve();
            };
            img.onerror = (err) => {
                reject(err);
            }
            img.src = URL.createObjectURL(this.imageBlob);
        });
    }

    async resetCamera() {
        return new Promise((resolve) => {
            this.camera.position.set(0, 1.5, 4.5);
            this.controls.target.set(0, 1.0, 0);
            this.controls.update();
            resolve();
        });
    }

    async unload() {
        return new Promise((resolve) => {
            this.running = false;
            this.rendering = false;
            while (this.scene.children.length > 0) {
                this.scene.remove(this.scene.children[0]);
            }
            this.renderer.dispose();
            this.container.removeChild(this.renderer.domElement);
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
            }
            resolve();
        });
    }

    animate() {
        if (!this.running) return;
        requestAnimationFrame(this.animate.bind(this));
        if (this.rendering) {
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        }
    }
}