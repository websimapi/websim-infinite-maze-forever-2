// render3d.js - Three.js based 3D rendering system for maze exploration
import { MAZE_CELL_SIZE, DRAWING_RESOLUTION, PALETTE } from 'config';
import { get3DModeEnabled } from './settings.js';
import { isWall } from './mazeUtils.js';
import { getProtectedMazeData } from './startSquareProtection.js';
import { getIsMobile } from './input.js';

// Module state
let is3DMode = false;
let threeRenderer = null;
let scene = null;
let camera = null;
let mazeGroup = null;
let lightGroup = null;
let canvasRef = null;
let roomRef = null;
let mazeRef = null;
let domElement = null;
let cameraYaw = 0;
let cameraPitch = 0;
let lastPosition = { x: 0, y: 0 };
let mazeMeshes = {}; // Cached meshes by coordinates
let playerMeshes = {}; // Track 3D player cubes
let playerLabels = {}; // Track player name labels
let textureLoader = null; // Texture loader for avatars
let lastCameraDirection = { x: 0, y: -1 };
let isInitialized = false;
let materialCache = {};
let geometryCache = {};
let lastRenderTime = 0;
let frameCount = 0;
let needsFullRebuild = false;
let throttledUpdateTimer = null;
let viewDistance = 200; // How far we can see in 3D mode
let wallHeight = 3; // Reduced from 10 to 6 to make walls shorter
let lowQualityMode = false;
let floorTextureCache = new WeakMap(); // Cache for floor textures
let DEFAULT_FLOOR_INDEX = 0; // Default floor color index

// Text rendering for player labels
let labelRenderer = null;
let labelScene = null;

// Touch control state
let touchStartX = 0;
let touchStartY = 0;
let isTouchActive = false;
let touchSensitivity = 0.002; // Adjust as needed for mobile

/**
 * Initialize the 3D renderer with Three.js
 * @param {Object} _room - The websim room reference
 * @param {HTMLCanvasElement} _canvas - The canvas element
 * @param {CanvasRenderingContext2D} _ctx - The canvas 2D context
 * @param {Object} _maze - The maze data reference
 */
export function init3DRenderer(_room, _canvas, _ctx, _maze) {
    // Store references
    roomRef = _room;
    canvasRef = _canvas;
    mazeRef = _maze;
    
    // We'll initialize Three.js only when 3D mode is actually enabled
    isInitialized = false;
    console.log("Three.js 3D renderer initialized (lazy loading)");
    
    // Import Three.js only when needed
    if (!window.THREE) {
        console.log("Loading Three.js library...");
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
        script.async = true;
        script.onload = () => console.log("Three.js loaded successfully");
        document.head.appendChild(script);
    }
}

/**
 * Update the maze reference when it changes
 * @param {Object} _maze - The new maze data reference
 */
export function update3DMazeReference(_maze) {
    if (_maze !== mazeRef) {
        mazeRef = _maze;
        if (is3DMode && isInitialized) {
            // Force a full rebuild when maze data changes
            needsFullRebuild = true;
            // Schedule a rebuild immediately without delay
            if (throttledUpdateTimer) {
                clearTimeout(throttledUpdateTimer);
            }
            throttledUpdateTimer = setTimeout(() => {
                if (isInitialized && is3DMode) {
                    rebuildVisibleMazeGeometry();
                    needsFullRebuild = false;
                }
                throttledUpdateTimer = null;
            }, 100); // Shorter delay (100ms) for better responsiveness
        }
    }
}

/**
 * Schedule a throttled update to prevent too many rebuilds
 */
function scheduleThrottledMazeUpdate() {
    // Mark that we need a full rebuild
    needsFullRebuild = true;
    
    // Clear existing timer
    if (throttledUpdateTimer) {
        clearTimeout(throttledUpdateTimer);
    }
    
    // Schedule an update after a delay
    throttledUpdateTimer = setTimeout(() => {
        if (isInitialized && is3DMode) {
            rebuildVisibleMazeGeometry();
            needsFullRebuild = false;
        }
        throttledUpdateTimer = null;
    }, 100); // Reduced from 300ms to 100ms for better responsiveness
}

/**
 * Handle touch start event for mobile camera control
 * @param {TouchEvent} event - The touch start event
 */
function handleTouchStart(event) {
    if (!is3DMode || !isInitialized) return;
    
    // Get the first touch point
    if (event.touches.length > 0) {
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        isTouchActive = true;
    }
}

/**
 * Handle touch move event for mobile camera control
 * @param {TouchEvent} event - The touch move event
 */
function handleTouchMove(event) {
    if (!is3DMode || !isInitialized || !isTouchActive) return;
    
    // Prevent default behavior to avoid scrolling
    event.preventDefault();
    
    if (event.touches.length > 0) {
        const touchX = event.touches[0].clientX;
        const touchY = event.touches[0].clientY;
        
        // Calculate movement deltas
        const movementX = touchX - touchStartX;
        const movementY = touchY - touchStartY;
        
        // Update start positions for next move
        touchStartX = touchX;
        touchStartY = touchY;
        
        // Apply camera rotation with appropriate sensitivity
        cameraYaw -= movementX * touchSensitivity;
        cameraPitch -= movementY * touchSensitivity;
        
        // Ensure yaw is wrapped to 0-2π
        cameraYaw = cameraYaw % (Math.PI * 2);
        if (cameraYaw < 0) cameraYaw += Math.PI * 2;
        
        // Limit pitch to avoid camera flipping
        cameraPitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, cameraPitch));
        
        updateCameraDirection();
    }
}

/**
 * Handle touch end event for mobile camera control
 */
function handleTouchEnd() {
    isTouchActive = false;
}

/**
 * Toggle 3D mode on or off
 * @param {boolean} enabled - Whether 3D mode should be enabled
 */
export function toggle3DMode(enabled) {
    if (enabled === is3DMode) return; // No change
    
    is3DMode = enabled;
    console.log(`Three.js 3D mode ${enabled ? 'enabled' : 'disabled'}`);
    
    if (enabled) {
        // Initialize Three.js if not already initialized
        if (!isInitialized) {
            initializeThreeJS();
        }
        
        // Start with default camera angle
        const currentPlayer = roomRef?.presence?.[roomRef?.clientId];
        if (currentPlayer && typeof currentPlayer.cameraYaw === 'number') {
            cameraYaw = currentPlayer.cameraYaw;
        } else {
            cameraYaw = 0; // Default facing north
        }
        updateCameraDirection();
        
        // Show the Three.js canvas 
        if (domElement) {
            domElement.style.display = 'block';
        }
        
        // Hide zoom buttons in 3D mode (they're not needed)
        const zoomButtons = document.getElementById('zoom-buttons');
        if (zoomButtons) {
            zoomButtons.style.display = 'none';
        }
        
        // Add touch controls for mobile
        if (getIsMobile() && canvasRef) {
            canvasRef.addEventListener('touchstart', handleTouchStart, { passive: false });
            canvasRef.addEventListener('touchmove', handleTouchMove, { passive: false });
            canvasRef.addEventListener('touchend', handleTouchEnd);
        }
        
        // Request pointer lock for better control on desktop
        if (document.pointerLockElement !== canvasRef) {
            canvasRef.requestPointerLock = canvasRef.requestPointerLock ||
                                         canvasRef.mozRequestPointerLock ||
                                         canvasRef.webkitRequestPointerLock;
            if (canvasRef.requestPointerLock) {
                canvasRef.requestPointerLock();
            }
        }
        
        // Reset frame counter
        frameCount = 0;
        
        // Force a full rebuild
        needsFullRebuild = true;
        rebuildVisibleMazeGeometry();
    } else {
        // Hide the Three.js canvas when 3D mode is off
        if (domElement) {
            domElement.style.display = 'none';
        }
        
        // Restore zoom buttons if on mobile
        const zoomButtons = document.getElementById('zoom-buttons');
        if (zoomButtons && getIsMobile()) {
            zoomButtons.style.display = 'flex';
        }
        
        // Remove touch controls
        if (canvasRef) {
            canvasRef.removeEventListener('touchstart', handleTouchStart);
            canvasRef.removeEventListener('touchmove', handleTouchMove);
            canvasRef.removeEventListener('touchend', handleTouchEnd);
        }
    }
}

/**
 * Initialize the Three.js engine
 */
function initializeThreeJS() {
    if (!window.THREE) {
        console.error("Three.js is not loaded yet!");
        return;
    }
    
    // Create the Three.js renderer
    threeRenderer = new THREE.WebGLRenderer({ antialias: true });
    threeRenderer.setSize(window.innerWidth, window.innerHeight);
    threeRenderer.setClearColor(0x87CEEB); // Sky blue background
    threeRenderer.setPixelRatio(window.devicePixelRatio);
    
    // Add the Three.js canvas to the page
    domElement = threeRenderer.domElement;
    domElement.style.position = 'absolute';
    domElement.style.top = '0';
    domElement.style.left = '0';
    domElement.style.width = '100%';
    domElement.style.height = '100%';
    domElement.style.zIndex = '5';
    domElement.style.pointerEvents = 'none'; // Let events pass through to the main canvas
    domElement.style.display = 'none'; // Start hidden
    canvasRef.parentElement.appendChild(domElement);
    
    // Create the scene
    scene = new THREE.Scene();
    // Even lighter fog with increased distances for more visibility
    scene.fog = new THREE.Fog(0xCCE8FF, 100, viewDistance); // Much lighter blue fog, starts even further away
    
    // Create the perspective camera
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, viewDistance);
    camera.rotation.order = 'YXZ'; // YXZ rotation order to handle pitch and yaw correctly
    
    // Initialize CSS3D renderer for player labels
    try {
        // We'll use DIV elements for player labels
        labelScene = new THREE.Scene();
    } catch (e) {
        console.error("Failed to initialize CSS3D renderer:", e);
    }
    
    // Initialize texture loader for player avatars
    textureLoader = new THREE.TextureLoader();
    
    // Add lighting with significantly increased brightness
    lightGroup = new THREE.Group();
    
    // Ambient light for general illumination - significantly increased intensity
    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.9); // Increased from 0.7 to 0.9
    lightGroup.add(ambientLight);
    
    // Directional light for shadows - increased intensity and better angle
    const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 1.2); // Increased from 1.0 to 1.2
    directionalLight.position.set(1, 2.5, 0.5); // Higher position for better lighting
    lightGroup.add(directionalLight);
    
    // Second directional light with increased intensity
    const secondLight = new THREE.DirectionalLight(0xFFEEDD, 0.8); // Increased from 0.6 to 0.8
    secondLight.position.set(-1, 1.5, -0.5); // Adjusted for better coverage
    lightGroup.add(secondLight);
    
    // Add a third, fill light to reduce shadows
    const fillLight = new THREE.DirectionalLight(0xE1EFFF, 0.6);
    fillLight.position.set(0, -1, 2); // Light from below to brighten undersides
    lightGroup.add(fillLight);
    
    scene.add(lightGroup);
    
    // Create a group for maze elements
    mazeGroup = new THREE.Group();
    scene.add(mazeGroup);
    
    // Initialize geometry and material caches
    initializeCaches();
    
    // Handle window resize
    window.addEventListener('resize', handleResize);
    
    isInitialized = true;
    console.log("Three.js initialized successfully");
    
    // Build the initial maze geometry
    rebuildVisibleMazeGeometry();
}

/**
 * Initialize cached geometries and materials
 */
function initializeCaches() {
    // Create box geometry for walls
    geometryCache.wall = new THREE.BoxGeometry(1, wallHeight, 1);
    
    // Create plane geometry for floors
    geometryCache.floor = new THREE.PlaneGeometry(1, 1);
    geometryCache.floor.rotateX(-Math.PI / 2); // Make it horizontal
    
    // Create default unclaimed materials - much lighter
    materialCache.unclaimed = new THREE.MeshStandardMaterial({
        color: 0x444444, // Lightened to be more visible
        roughness: 0.7, // Reduced roughness for more reflectivity
        metalness: 0.3 // Increased metalness for more reflectivity
    });
    
    // Pre-cache materials for all palette colors - made much brighter
    PALETTE.forEach((entry, index) => {
        // Convert hex to RGB to adjust brightness
        const color = new THREE.Color(entry.color);
        
        // Make colors significantly brighter for better visibility
        if (entry.isWall) {
            // Brighten wall colors more
            color.r = Math.min(1, color.r * 1.3);
            color.g = Math.min(1, color.g * 1.3);
            color.b = Math.min(1, color.b * 1.3);
        } else {
            // Brighten floor colors even more
            color.r = Math.min(1, color.r * 1.4);
            color.g = Math.min(1, color.g * 1.4);
            color.b = Math.min(1, color.b * 1.4);
        }
        
        materialCache[`palette_${index}`] = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.6, // Reduced from 0.7 for more shine
            metalness: entry.isWall ? 0.25 : 0.1, // Slightly increased metalness for better reflection
            emissive: entry.isWall ? 0x000000 : new THREE.Color(color).multiplyScalar(0.1) // Add subtle emission to floors
        });
    });
    
    // Create a geometry for player avatars - cube slightly smaller than wall height
    geometryCache.player = new THREE.BoxGeometry(1, 1, 1);
}

/**
 * Handle window resize events
 */
function handleResize() {
    if (!camera || !threeRenderer) return;
    
    // Update camera aspect ratio
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    // Update renderer size
    threeRenderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Update camera direction based on cameraYaw and cameraPitch
 */
function updateCameraDirection() {
    // Calculate the view direction vector
    lastCameraDirection.x = Math.sin(cameraYaw) * Math.cos(cameraPitch);
    lastCameraDirection.y = -Math.cos(cameraYaw) * Math.cos(cameraPitch);
    const dirZ = Math.sin(cameraPitch);
    
    // Update camera rotation
    if (camera) {
        camera.rotation.y = cameraYaw;
        camera.rotation.x = cameraPitch;
    }
    
    // Save camera direction to presence for persistence
    if (roomRef && roomRef.clientId) {
        roomRef.updatePresence({
            cameraYaw: cameraYaw
        });
    }
}

/**
 * Handles mouse movement for camera rotation in 3D mode
 * @param {MouseEvent} event - The mouse move event
 */
export function handle3DMouseLook(event) {
    if (!is3DMode || !isInitialized) return;
    
    // Correct sensitivity values (negative for natural camera movement)
    const sensitivity = 0.002;
    cameraYaw -= event.movementX * sensitivity;
    
    // Ensure yaw is wrapped to 0-2π for cleaner math
    cameraYaw = cameraYaw % (Math.PI * 2);
    if (cameraYaw < 0) cameraYaw += Math.PI * 2;
    
    // Handle pitch with limits
    cameraPitch -= event.movementY * sensitivity;
    cameraPitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, cameraPitch));
    
    updateCameraDirection();
}

/**
 * Get the current camera direction for 3D movement
 * @returns {Object} The normalized direction vector {x, y}
 */
export function get3DCameraDirection() {
    return { ...lastCameraDirection };
}

/**
 * Check if 3D mode is currently active
 * @returns {boolean} True if 3D mode is enabled
 */
export function is3DModeActive() {
    return is3DMode && get3DModeEnabled();
}

/**
 * Create or update player cubes in the 3D scene
 */
function updatePlayerCubes() {
    if (!is3DMode || !isInitialized || !scene || !textureLoader) return;
    
    const currentPresence = roomRef?.presence || {};
    const peers = roomRef?.peers || {};
    const currentClientId = roomRef?.clientId;
    
    // Track active player IDs
    const activePlayerIds = new Set(Object.keys(currentPresence));
    
    // Remove meshes for players who are no longer present
    Object.keys(playerMeshes).forEach(clientId => {
        if (!activePlayerIds.has(clientId)) {
            // Remove and dispose mesh
            if (playerMeshes[clientId]) {
                scene.remove(playerMeshes[clientId]);
                if (playerMeshes[clientId].material) {
                    if (Array.isArray(playerMeshes[clientId].material)) {
                        playerMeshes[clientId].material.forEach(m => m.dispose());
                    } else {
                        playerMeshes[clientId].material.dispose();
                    }
                }
                if (playerMeshes[clientId].geometry) {
                    playerMeshes[clientId].geometry.dispose();
                }
                delete playerMeshes[clientId];
            }
            
            // Remove player name label
            if (playerLabels[clientId]) {
                scene.remove(playerLabels[clientId]);
                if (playerLabels[clientId].material) {
                    playerLabels[clientId].material.dispose();
                }
                delete playerLabels[clientId];
            }
            
            console.log(`Removed 3D player cube for disconnected player ${clientId}`);
        }
    });
    
    // Create/update meshes for all active players except self
    activePlayerIds.forEach(clientId => {
        if (clientId === currentClientId) return; // Skip self
        
        const playerState = currentPresence[clientId];
        const peerInfo = peers[clientId];
        
        if (!playerState || playerState.x === undefined || playerState.y === undefined || !peerInfo) {
            // Hide player if no position data
            if (playerMeshes[clientId]) {
                playerMeshes[clientId].visible = false;
            }
            if (playerLabels[clientId]) {
                playerLabels[clientId].visible = false;
            }
            return;
        }
        
        // Show player mesh and update position
        createOrUpdatePlayerMesh(clientId, playerState, peerInfo);
    });
}

/**
 * Create or update a player's 3D representation
 */
function createOrUpdatePlayerMesh(clientId, playerState, peerInfo) {
    // Calculate size proportional to wall height but smaller relative to environment
    const cubeSize = wallHeight * 0.3; // Reduced from 0.45 to 0.35 to make player smaller
    const cubeHeight = wallHeight * 0.6; // Position slightly above ground
    
    // Create mesh if it doesn't exist
    if (!playerMeshes[clientId]) {
        createPlayerCube(clientId, peerInfo, cubeSize);
    }
    
    // Update position
    if (playerMeshes[clientId]) {
        playerMeshes[clientId].visible = true;
        
        // Add smooth position update with interpolation
        const cube = playerMeshes[clientId];
        
        // Simple interpolation for smoother movement
        if (cube.userData && cube.userData.targetX !== undefined) {
            cube.position.x += (playerState.x - cube.position.x) * 0.1;
            cube.position.z += (playerState.y - cube.position.z) * 0.1;
        } else {
            // First time positioning or no previous data
            cube.position.set(
                playerState.x,
                cubeHeight / 2, // Position at half height so bottom is on ground
                playerState.y
            );
        }
        
        // Update label position to match cube position
        if (playerLabels[clientId]) {
            playerLabels[clientId].visible = true;
            playerLabels[clientId].position.set(
                cube.position.x,
                cubeHeight + 0.3, // Lower height - positioned closer to the cube
                cube.position.z
            );
            
            // Update scale based on distance to camera
            if (camera) {
                const distance = camera.position.distanceTo(cube.position);
                // Scale up with distance for better visibility
                const scale = Math.max(1.0, Math.min(2.0, distance / 10)); // Larger minimum scale
                playerLabels[clientId].scale.set(scale * 2, scale, 1); // Scale x dimension more to prevent text squishing
            }
        }
        
        // Store target positions for next frame's interpolation
        if (!cube.userData) cube.userData = {};
        cube.userData.targetX = playerState.x;
        cube.userData.targetZ = playerState.y;
        
        // Add subtle rotation for visual interest
        cube.rotation.y += 0.01; // Slowly rotate the cube
    }
}

/**
 * Create a player cube with avatar textures on all sides
 */
function createPlayerCube(clientId, peerInfo, size) {
    if (!peerInfo || !peerInfo.avatarUrl || !textureLoader) return;
    
    // Create a placeholder cube with temporary material
    const geometry = geometryCache.player.clone();
    geometry.scale(size, size, size);
    
    const placeholderMaterial = new THREE.MeshBasicMaterial({
        color: 0x8888ff, // Light blue placeholder
        wireframe: true
    });
    
    const cube = new THREE.Mesh(geometry, placeholderMaterial);
    cube.userData = { 
        pendingLoad: true,
        clientId: clientId,
        username: peerInfo.username
    };
    
    // Add to scene and store in cache
    scene.add(cube);
    playerMeshes[clientId] = cube;
    
    // Create the name label using sprite
    createPlayerNameLabel(clientId, peerInfo.username);
    
    // Load the avatar texture
    textureLoader.load(
        peerInfo.avatarUrl,
        // Success callback
        (texture) => {
            if (!playerMeshes[clientId] || !scene.getObjectById(cube.id)) return; // Player left during loading
            
            // Create materials for all six sides using the same texture
            const materials = [];
            for (let i = 0; i < 6; i++) {
                materials.push(new THREE.MeshBasicMaterial({
                    map: texture,
                    transparent: true,
                }));
            }
            
            // Update the cube with the avatar materials
            playerMeshes[clientId].material = materials;
            playerMeshes[clientId].userData.pendingLoad = false;
            
            console.log(`Created 3D player cube for ${peerInfo.username}`);
        },
        // Progress callback
        undefined,
        // Error callback
        (error) => {
            console.error(`Failed to load avatar for ${clientId}:`, error);
            // Keep the placeholder if loading fails
            if (playerMeshes[clientId]) {
                playerMeshes[clientId].userData.pendingLoad = false;
                // Set a colored material instead of wireframe
                playerMeshes[clientId].material = new THREE.MeshBasicMaterial({
                    color: 0x8888ff,
                });
            }
        }
    );
}

/**
 * Create a text label showing player name above the cube
 */
function createPlayerNameLabel(clientId, username) {
    // Create a canvas texture for the name label
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = 24;
    
    // Set canvas size based on text length
    canvas.width = Math.max(256, username.length * fontSize);
    canvas.height = 64; // Fixed height
    
    // Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw name with white text and black outline for visibility
    context.font = `bold ${fontSize}px Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Background for better visibility
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    const textWidth = context.measureText(username).width;
    context.fillRect(
        canvas.width/2 - textWidth/2 - 5,
        canvas.height/2 - fontSize/2 - 3,
        textWidth + 10,
        fontSize + 6
    );
    
    // Text outline for better visibility
    context.strokeStyle = 'black';
    context.lineWidth = 3;
    context.strokeText(username, canvas.width/2, canvas.height/2);
    
    // Text fill
    context.fillStyle = 'white';
    context.fillText(username, canvas.width/2, canvas.height/2);
    
    // Create sprite from canvas
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        depthTest: false, // Ensure label is always visible
        depthWrite: false
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(3, 1, 1); // Adjust scale to make text readable
    
    // Add to scene and store
    scene.add(sprite);
    playerLabels[clientId] = sprite;
    
    return sprite;
}

/**
 * Rebuild the maze geometry for the visible area
 */
function rebuildVisibleMazeGeometry() {
    if (!isInitialized || !mazeGroup || !mazeRef) return;
    
    console.log("Rebuilding 3D maze geometry...");
    
    // Get player position
    const player = roomRef?.presence?.[roomRef?.clientId];
    if (!player || player.x === undefined || player.y === undefined) return;
    
    // Convert to maze coordinates
    const centerMazeX = Math.floor(player.x / MAZE_CELL_SIZE);
    const centerMazeY = Math.floor(player.y / MAZE_CELL_SIZE);
    
    // Clear existing meshes that are far away
    const viewDistanceSquares = Math.ceil(viewDistance / MAZE_CELL_SIZE);
    const keysToRemove = [];
    
    for (const key in mazeMeshes) {
        const [mazeX, mazeY] = key.split(',').map(Number);
        const distance = Math.max(
            Math.abs(mazeX - centerMazeX),
            Math.abs(mazeY - centerMazeY)
        );
        
        if (distance > viewDistanceSquares) {
            keysToRemove.push(key);
        }
    }
    
    // Remove distant meshes
    keysToRemove.forEach(key => {
        if (mazeMeshes[key]) {
            mazeGroup.remove(mazeMeshes[key]);
            mazeMeshes[key].traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            delete mazeMeshes[key];
        }
    });
    
    // Get protected maze data to ensure start square is rendered correctly
    const protectedMazeData = getProtectedMazeData(mazeRef);
    
    // Build geometry for visible squares
    const renderDistance = Math.min(15, viewDistanceSquares); // Limit to reasonable range
    
    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
        for (let dy = -renderDistance; dy <= renderDistance; dy++) {
            const mazeX = centerMazeX + dx;
            const mazeY = centerMazeY + dy;
            const key = `${mazeX},${mazeY}`;
            
            // Skip if this square is already built
            if (mazeMeshes[key] && !needsFullRebuild) continue;
            
            // If rebuilding and the mesh exists, remove it first
            if (mazeMeshes[key] && needsFullRebuild) {
                mazeGroup.remove(mazeMeshes[key]);
                mazeMeshes[key].traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
                delete mazeMeshes[key];
            }
            
            // Get square data from the protected maze data
            const squareData = protectedMazeData[key]?.data;
            
            // Create a group for this square
            const squareGroup = new THREE.Group();
            squareGroup.position.set(
                mazeX * MAZE_CELL_SIZE + MAZE_CELL_SIZE / 2,
                0,
                mazeY * MAZE_CELL_SIZE + MAZE_CELL_SIZE / 2
            );
            
            // Scale the group to fit the maze cell size
            squareGroup.scale.set(
                MAZE_CELL_SIZE / DRAWING_RESOLUTION,
                1,
                MAZE_CELL_SIZE / DRAWING_RESOLUTION
            );
            
            // Adjust group position to center properly
            squareGroup.position.x -= MAZE_CELL_SIZE / 2;
            squareGroup.position.z -= MAZE_CELL_SIZE / 2;
            
            // If square has data, build detailed geometry
            if (squareData) {
                buildSquareGeometry(squareData, squareGroup);
            } else {
                // Empty square - add a simple floor with pattern
                buildEmptySquareGeometry(squareGroup);
            }
            
            // Add to scene and cache
            mazeGroup.add(squareGroup);
            mazeMeshes[key] = squareGroup;
        }
    }
    
    console.log(`Maze geometry rebuilt with ${Object.keys(mazeMeshes).length} squares`);
}

/**
 * Build 3D geometry for an empty/unclaimed square
 * @param {THREE.Group} group - The group to add geometry to
 */
function buildEmptySquareGeometry(group) {
    // Add a floor plane for the unclaimed square
    const floor = new THREE.Mesh(
        geometryCache.floor,
        materialCache.unclaimed
    );
    floor.position.set(DRAWING_RESOLUTION / 2, 0, DRAWING_RESOLUTION / 2);
    floor.scale.set(DRAWING_RESOLUTION, DRAWING_RESOLUTION, 1);
    group.add(floor);
}

/**
 * Build 3D geometry for a maze square with data
 * @param {Array<Array<number>>} squareData - 2D array of pixel data
 * @param {THREE.Group} group - The group to add geometry to
 */
function buildSquareGeometry(squareData, group) {
    // Create grid for walls only - floors will use texture
    const wallGrid = Array(DRAWING_RESOLUTION).fill().map(() => Array(DRAWING_RESOLUTION).fill(-1));
    
    // Populate wall grid with color indices
    for (let y = 0; y < DRAWING_RESOLUTION; y++) {
        if (!squareData[y]) continue;
        
        for (let x = 0; x < DRAWING_RESOLUTION; x++) {
            if (squareData[y][x] === undefined) continue;
            
            const colorIndex = squareData[y][x];
            if (colorIndex < 0 || colorIndex >= PALETTE.length) continue;
            
            if (PALETTE[colorIndex].isWall) {
                wallGrid[y][x] = colorIndex;
            }
        }
    }
    
    // Create optimized meshes for walls
    createOptimizedMeshes(wallGrid, true, group);
    
    // For floor, create a single textured plane using the original data
    createTexturedFloor(squareData, group);
}

/**
 * Creates a single textured floor plane for the square - OPTIMIZED VERSION
 * @param {Array<Array<number>>} squareData - 2D array of pixel data
 * @param {THREE.Group} group - The group to add the floor to
 */
function createTexturedFloor(squareData, group) {
    // Use the square reference itself as the cache key
    // This is much more efficient than stringifying the entire data
    const cacheKey = squareData;
    
    // Check if we already have a texture for this exact square data
    if (!floorTextureCache.has(cacheKey)) {
        // For low quality mode, we can use a downsampled version
        const textureSize = lowQualityMode ? DRAWING_RESOLUTION/2 : DRAWING_RESOLUTION;
        const scaleFactor = lowQualityMode ? 2 : 1;
        
        // Create a canvas to draw the floor texture
        const canvas = document.createElement('canvas');
        canvas.width = textureSize;
        canvas.height = textureSize;
        const ctx = canvas.getContext('2d', { alpha: true }); // Changed to alpha: true to support transparency
        
        // Fill with default floor color first (reduces transparency issues)
        ctx.fillStyle = PALETTE[DEFAULT_FLOOR_INDEX]?.color || '#FFFFFF';
        ctx.fillRect(0, 0, textureSize, textureSize);
        
        // Draw the floor texture
        for (let y = 0; y < DRAWING_RESOLUTION; y++) {
            const rowData = squareData[y];
            if (!rowData) continue;
            
            for (let x = 0; x < DRAWING_RESOLUTION; x++) {
                const colorIndex = rowData[x];
                if (colorIndex === undefined || colorIndex < 0 || colorIndex >= PALETTE.length) continue;
                
                // Only set colors for non-wall pixels
                if (!PALETTE[colorIndex].isWall) {
                    if (PALETTE[colorIndex].isHole) {
                        // Make holes fully transparent in the texture
                        ctx.clearRect(x, y, 1, 1);
                        ctx.globalCompositeOperation = 'destination-out';
                        ctx.fillRect(x, y, 1, 1);
                        ctx.globalCompositeOperation = 'source-over';
                    } else {
                        ctx.fillStyle = PALETTE[colorIndex].color;
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            }
        }
        
        // Create texture from canvas with optimized settings
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        
        // Use a weak map for better memory management
        floorTextureCache.set(cacheKey, texture);
    }
    
    // Create a material using the cached texture
    const floorMaterial = new THREE.MeshStandardMaterial({
        map: floorTextureCache.get(cacheKey),
        side: THREE.DoubleSide, // Changed to DoubleSide to ensure visibility
        transparent: true,      // Enable transparency for holes
        alphaTest: 0.1          // Only render pixels with alpha > 0.1
    });
    
    // Create a single plane for the entire floor
    const floorGeometry = new THREE.PlaneGeometry(DRAWING_RESOLUTION, DRAWING_RESOLUTION);
    floorGeometry.rotateX(-Math.PI / 2); // Make it horizontal
    
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    
    // Position the floor at the base of the square
    floorMesh.position.set(
        DRAWING_RESOLUTION / 2,  // Center X
        0,              // Bottom Y
        DRAWING_RESOLUTION / 2  // Center Z
    );
    
    group.add(floorMesh);
}

/**
 * Creates optimized meshes from a grid, using a greedy approach
 * @param {Array<Array<number>>} grid - 2D grid of color indices (-1 for empty)
 * @param {boolean} isWall - Whether to create wall geometries or floor geometries
 * @param {THREE.Group} group - The group to add meshes to
 */
function createOptimizedMeshes(grid, isWall, group) {
    const visited = Array(DRAWING_RESOLUTION).fill().map(() => Array(DRAWING_RESOLUTION).fill(false));
    
    // Use low quality mode to further reduce geometry in low quality mode
    const skipCheck = lowQualityMode ? 2 : 1; // Skip every other pixel in low quality mode
    
    for (let y = 0; y < DRAWING_RESOLUTION; y += skipCheck) {
        for (let x = 0; x < DRAWING_RESOLUTION; x += skipCheck) {
            // Skip if empty or already visited
            if (grid[y][x] === -1 || visited[y][x]) continue;
            
            const colorIndex = grid[y][x];
            
            // Find maximum width (x direction)
            let width = skipCheck;
            while (x + width < DRAWING_RESOLUTION && 
                  grid[y][x + width] === colorIndex && 
                  !visited[y][x + width]) {
                width += skipCheck;
            }
            
            // Find maximum height (y direction) for this width
            let height = skipCheck;
            let canExtend = true;
            
            while (canExtend && y + height < DRAWING_RESOLUTION) {
                for (let i = 0; i < width; i += skipCheck) {
                    if (grid[y + height][x + i] !== colorIndex || visited[y + height][x + i]) {
                        canExtend = false;
                        break;
                    }
                }
                
                if (canExtend) {
                    height += skipCheck;
                }
            }
            
            // Mark all these pixels as visited
            for (let j = 0; j < height; j += skipCheck) {
                for (let i = 0; i < width; i += skipCheck) {
                    visited[y + j][x + i] = true;
                }
            }
            
            // Create the appropriate geometry based on type
            const material = materialCache[`palette_${colorIndex}`];
            
            if (isWall) {
                // Create a wall box
                const boxGeometry = new THREE.BoxGeometry(
                    width,      // width (x)
                    wallHeight, // height (y)
                    height      // depth (z)
                );
                
                const wallMesh = new THREE.Mesh(boxGeometry, material);
                
                // Position the wall
                wallMesh.position.set(
                    x + width / 2,  // Center X
                    wallHeight / 2, // Half height (Y)
                    y + height / 2  // Center Z
                );
                
                group.add(wallMesh);
            } else {
                // Create a floor plane
                const planeGeometry = new THREE.PlaneGeometry(
                    width,  // width (x)
                    height  // height (z)
                );
                
                // Rotate to make it horizontal
                planeGeometry.rotateX(-Math.PI / 2);
                
                const floorMesh = new THREE.Mesh(planeGeometry, material);
                
                // Position the floor
                floorMesh.position.set(
                    x + width / 2,  // Center X
                    0,              // Bottom Y
                    y + height / 2  // Center Z
                );
                
                group.add(floorMesh);
            }
        }
    }
}

/**
 * Main rendering function for 3D mode
 * @param {Object} cameraTransform - Camera transform from 2D renderer (unused in 3D mode)
 */
export function draw3DFrame(cameraTransform) {
    if (!is3DMode || !isInitialized || !threeRenderer || !scene || !camera) {
        return;
    }
    
    // Get player position
    const player = roomRef?.presence?.[roomRef?.clientId];
    if (!player || player.x === undefined || player.y === undefined) {
        return;
    }
    
    // Always hide player avatars in 3D mode
    const playerAvatars = document.querySelectorAll('.player-avatar');
    playerAvatars.forEach(avatar => {
        avatar.style.display = 'none';
    });
    
    // Hide zoom buttons in 3D mode
    const zoomButtons = document.getElementById('zoom-buttons');
    if (zoomButtons) {
        zoomButtons.style.display = 'none';
    }
    
    // Update other player cubes
    updatePlayerCubes();
    
    // Check if player moved enough to warrant a rebuild
    const distSq = (player.x - lastPosition.x)**2 + (player.y - lastPosition.y)**2;
    if (distSq > (MAZE_CELL_SIZE * 1.5)**2 || needsFullRebuild) {
        lastPosition.x = player.x;
        lastPosition.y = player.y;
        rebuildVisibleMazeGeometry();
        needsFullRebuild = false;
    }
    
    // Update camera position
    camera.position.set(
        player.x,
        wallHeight * 0.7, // Adjust camera height proportionally to wall height
        player.y
    );
    
    // Render the scene
    threeRenderer.render(scene, camera);
    
    // Performance monitoring
    frameCount++;
    const now = performance.now();
    if (now - lastRenderTime >= 5000) { // Log every 5 seconds
        const fps = frameCount / ((now - lastRenderTime) / 1000);
        console.log(`Three.js rendering at ${fps.toFixed(1)} FPS with ${Object.keys(mazeMeshes).length} maze squares and ${Object.keys(playerMeshes).length} player cubes`);
        frameCount = 0;
        lastRenderTime = now;
    }
}

/**
 * Clean up Three.js resources when no longer needed
 */
function cleanup() {
    if (!isInitialized) return;
    
    // Remove window resize listener
    window.removeEventListener('resize', handleResize);
    
    // Remove touch event listeners
    if (canvasRef) {
        canvasRef.removeEventListener('touchstart', handleTouchStart);
        canvasRef.removeEventListener('touchmove', handleTouchMove);
        canvasRef.removeEventListener('touchend', handleTouchEnd);
    }
    
    // Dispose of all resources
    for (const key in mazeMeshes) {
        const mesh = mazeMeshes[key];
        if (mesh) {
            mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
    }
    
    // Clean up player meshes
    for (const clientId in playerMeshes) {
        if (playerMeshes[clientId]) {
            scene.remove(playerMeshes[clientId]);
            if (playerMeshes[clientId].material) {
                if (Array.isArray(playerMeshes[clientId].material)) {
                    playerMeshes[clientId].material.forEach(m => m.dispose());
                } else {
                    playerMeshes[clientId].material.dispose();
                }
            }
            if (playerMeshes[clientId].geometry) {
                playerMeshes[clientId].geometry.dispose();
            }
        }
    }
    
    // Clear caches
    materialCache = {};
    geometryCache = {};
    mazeMeshes = {};
    playerMeshes = {};
    playerLabels = {};
    
    // Dispose of Three.js objects
    scene = null;
    camera = null;
    
    // Remove renderer and its DOM element
    if (threeRenderer) {
        threeRenderer.dispose();
        threeRenderer = null;
    }
    
    if (domElement && domElement.parentNode) {
        domElement.parentNode.removeChild(domElement);
    }
    
    domElement = null;
    isInitialized = false;
    
    // Also clean up the floor texture cache
    floorTextureCache = new WeakMap();
    
    console.log("Three.js resources cleaned up");
}

/**
 * Sets the render distance for 3D mode
 * @param {number} distance - The number of squares to render in each direction
 */
export function set3DRenderDistance(distance) {
    // Convert from squares to world units
    const newDistance = Math.max(5, Math.min(30, distance)) * MAZE_CELL_SIZE;
    if (newDistance !== viewDistance) {
        viewDistance = newDistance;
        console.log(`3D render distance set to ${distance} squares (${viewDistance} world units)`);
        
        // Update fog if scene exists
        if (scene) {
            scene.fog.near = 100;
            scene.fog.far = viewDistance;
        }
        
        // Update camera if it exists
        if (camera) {
            camera.far = viewDistance;
            camera.updateProjectionMatrix();
        }
        
        // Force a rebuild if in 3D mode
        if (is3DMode && isInitialized) {
            needsFullRebuild = true;
            if (throttledUpdateTimer) {
                clearTimeout(throttledUpdateTimer);
            }
            throttledUpdateTimer = setTimeout(() => {
                if (isInitialized && is3DMode) {
                    rebuildVisibleMazeGeometry();
                    needsFullRebuild = false;
                }
                throttledUpdateTimer = null;
            }, 100);
        }
    }
}

/**
 * Toggles low quality mode for better performance
 * @param {boolean} enabled - Whether low quality mode should be enabled
 */
export function set3DLowQualityMode(enabled) {
    if (lowQualityMode !== enabled) {
        lowQualityMode = enabled;
        console.log(`3D low quality mode ${enabled ? 'enabled' : 'disabled'}`);
        
        // Update renderer quality if it exists
        if (threeRenderer) {
            if (lowQualityMode) {
                // Lower pixel ratio for better performance
                threeRenderer.setPixelRatio(Math.min(1.0, window.devicePixelRatio));
                // Lower antialiasing level
                threeRenderer.antialias = false;
            } else {
                // Restore original quality
                threeRenderer.setPixelRatio(window.devicePixelRatio);
                // Original antialiasing setting
                threeRenderer.antialias = true;
            }
        }
        
        // Force a rebuild with simpler geometry if in 3D mode
        if (is3DMode && isInitialized) {
            // Clear geometry cache to rebuild with new quality settings
            geometryCache = {};
            initializeCaches();
            needsFullRebuild = true;
            if (throttledUpdateTimer) {
                clearTimeout(throttledUpdateTimer);
            }
            throttledUpdateTimer = setTimeout(() => {
                if (isInitialized && is3DMode) {
                    rebuildVisibleMazeGeometry();
                    needsFullRebuild = false;
                }
                throttledUpdateTimer = null;
            }, 100);
        }
    }
}

// Expose the functions globally so they can be called from the settings UI
window.set3DRenderDistance = set3DRenderDistance;
window.set3DLowQualityMode = set3DLowQualityMode;