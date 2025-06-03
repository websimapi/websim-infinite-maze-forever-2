// config.js
// REMOVED GRID_SIZE as it was causing confusion. World units are the base.
export const MAZE_CELL_SIZE = 20; // Size of one maze square in WORLD UNITS.
export const DRAWING_RESOLUTION = 100; // Internal grid size for drawing within one maze square (e.g., 100x100). Higher means more detail.
// Define player size in WORLD UNITS now.
export const PLAYER_WORLD_SIZE = 1; // Visual size of the player in world units (diameter)
// Reduce collision radius slightly more to fit 1-pixel gaps (1 pixel = CELL_SIZE / RESOLUTION = 0.2 units wide)
export const PLAYER_COLLISION_RADIUS = 0.09; // Player collision radius in world units. Allows fitting in 1-pixel gaps.
export const MOUSE_SENSITIVITY = 0.01; // Player movement speed factor relative to mouse movement (Pointer Lock)
export const PLAYER_COLOR = 'blue'; // Default color if avatar fails
export const OTHER_PLAYER_COLOR = 'red'; // Default color if avatar fails
export const DRAWING_AREA_BORDER_COLOR = 'rgba(0, 255, 0, 0.7)'; // Border around the square being edited
export const SELECTED_COLOR_BORDER = '3px solid #000'; // Border for the selected palette color
export const SELECTED_BRUSH_BORDER = '3px solid blue'; // Border for the selected brush size

// --- Input Speeds ---
// Max world units per second for continuous movement (Joystick/Keyboard)
export const PLAYER_CONTINUOUS_MOVE_SPEED = 10.0; // Renamed from JOYSTICK_MAX_SPEED
// Mobile Joystick configuration (deadzone only now)
export const JOYSTICK_DEADZONE = 0.1; // Ignore joystick input below this magnitude (0 to 1)

// Dithering setting
export const DEFAULT_DITHERING_ENABLED = true; // Default to enabled dithering for image imports

// Zoom configuration
export const INITIAL_ZOOM = 25.0; // Initial zoom level
export const MIN_ZOOM = 0.5; // Minimum zoom level (much more zoomed out)
export const MAX_ZOOM = 80.0; // Maximum zoom level (reduced from 120.0)
// BASE zoom sensitivity. This will be dynamically adjusted based on current zoom level.
// Significantly increased base sensitivity for faster zooming overall.
export const ZOOM_SENSITIVITY_BASE = 0.001; // Increased base sensitivity from 0.0003

// Brush sizes (radius in internal drawing resolution units)
export const BRUSH_SIZES = [0.5, 1, 3, 5, 8, 15]; // New sizes: 0.5, 1, 3, 5, 8, 15
export const DEFAULT_BRUSH_INDEX = 2; // Default to the third brush size (index 2 = size 3 radius)

// --- Chat ---
export const CHAT_MESSAGE_MAX_LENGTH = 150; // Max characters per chat message

// --- Hole Animation ---
export const HOLE_PULSE_SPEED = 2.5; // Speed of hole pulsing animation (cycles per second)
export const HOLE_MIN_OPACITY = 0.3; // Decreased from 0.5 for more dramatic effect (darker black)
export const HOLE_MAX_OPACITY = 0.9; // Maximum opacity during pulsing animation

// Palette: Colors marked with isWall: false are floors (passable).
// Colors marked with isWall: true are walls (blocking).
// Colors marked with isHole: true are holes (teleports player to start).
// Index 0 MUST be a floor color used for initializing empty cells and background.
// Maze state structure for `maze`: { "x,y": { data: [[...]], ownerId: "...", ownerUsername: "..." } }
export const PALETTE = [
    // Floor Colors (Light/Passable) - 12 colors
    { name: 'White Floor', color: '#FFFFFF', isWall: false },     // White
    { name: 'Lemonade', color: '#FFF9C4', isWall: false },        // Light Yellow
    { name: 'Peach', color: '#FFCCBC', isWall: false },           // Light Orange
    { name: 'Rose', color: '#F8BBD0', isWall: false },            // Light Pink
    { name: 'Lavender', color: '#E1BEE7', isWall: false },        // Light Purple
    { name: 'Periwinkle', color: '#D1C4E9', isWall: false },      // Light Blue-Purple
    { name: 'Sky', color: '#BBDEFB', isWall: false },             // Light Blue
    { name: 'Mint', color: '#B2DFDB', isWall: false },            // Light Teal
    { name: 'Sage', color: '#C8E6C9', isWall: false },            // Light Green
    { name: 'Honeydew', color: '#DCEDC8', isWall: false },        // Light Yellow-Green
    { name: 'Cream', color: '#FFF3E0', isWall: false },           // Light Beige
    { name: 'Powder', color: '#CFD8DC', isWall: false },          // Light Gray-Blue

    // Wall Colors (Dark/Blocking) - 12 colors
    { name: 'Black Wall', color: '#000000', isWall: true },       // Black
    { name: 'Amber', color: '#FBC02D', isWall: true },            // Dark Yellow
    { name: 'Rust', color: '#E64A19', isWall: true },             // Dark Orange
    { name: 'Ruby', color: '#C2185B', isWall: true },             // Dark Pink
    { name: 'Indigo', color: '#673AB7', isWall: true },           // Dark Purple
    { name: 'Navy', color: '#303F9F', isWall: true },             // Dark Blue
    { name: 'Azure', color: '#0277BD', isWall: true },            // Dark Sky Blue
    { name: 'Teal', color: '#00796B', isWall: true },             // Dark Teal
    { name: 'Forest', color: '#2E7D32', isWall: true },           // Dark Green
    { name: 'Olive', color: '#689F38', isWall: true },            // Dark Yellow-Green
    { name: 'Brown', color: '#5D4037', isWall: true },            // Dark Brown
    { name: 'Charcoal', color: '#455A64', isWall: true },         // Dark Gray-Blue
    
    // Special Colors
    { name: 'Hole', color: '#222222', isWall: false, isHole: true }, 
];

export const DEFAULT_FLOOR_INDEX = 0; // Index in PALETTE for the default floor color (White)
export const DEFAULT_WALL_INDEX = 12; // Index in PALETTE for the initial drawing color (Black Wall)
export const HOLE_INDEX = 24; // Index in PALETTE for the hole