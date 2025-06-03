// imageImport.js - Handles importing images into the drawing canvas

import { DRAWING_RESOLUTION, PALETTE, DEFAULT_DITHERING_ENABLED } from 'config';

// --- Helper Functions ---

/**
 * Converts a hex color string (#RRGGBB) to an RGB object.
 * @param {string} hex - The hex color string.
 * @returns {{r: number, g: number, b: number} | null} - RGB object or null if invalid hex.
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

/** Cache for palette RGB values */
const paletteRgbCache = PALETTE.map(p => ({ ...p, rgb: hexToRgb(p.color) }));

/**
 * Finds the index of the closest color in the PALETTE to the given RGB values.
 * Uses squared Euclidean distance in RGB space.
 * @param {number} r - Red component (0-255).
 * @param {number} g - Green component (0-255).
 * @param {number} b - Blue component (0-255).
 * @returns {number} - The index of the closest palette color.
 */
function findClosestPaletteColorIndex(r, g, b) {
    let minDistanceSq = Infinity;
    let closestIndex = 0; // Default to first color (should be default floor)

    paletteRgbCache.forEach((paletteEntry, index) => {
        // Skip hole color for regular color matching
        if (paletteEntry.isHole) return;
        
        if (!paletteEntry.rgb) return; // Skip if hex conversion failed

        const dr = r - paletteEntry.rgb.r;
        const dg = g - paletteEntry.rgb.g;
        const db = b - paletteEntry.rgb.b;
        const distanceSq = dr * dr + dg * dg + db * db;

        if (distanceSq < minDistanceSq) {
            minDistanceSq = distanceSq;
            closestIndex = index;
        }
    });

    return closestIndex;
}

// Find the hole color index in the palette
const HOLE_INDEX = PALETTE.findIndex(p => p.isHole === true);

// Track whether dithering is enabled
let ditheringEnabled = DEFAULT_DITHERING_ENABLED;

// Expose a global setter that settings.js can use
window.setDitheringEnabled = function(enabled) {
    ditheringEnabled = enabled;
    console.log(`ImageImport: Dithering ${enabled ? 'enabled' : 'disabled'}`);
};

// Export a getter for other modules if needed
export function getDitheringEnabled() {
    return ditheringEnabled;
}

/**
 * Maps the pixel data of an ImageData object to the closest palette colors.
 * @param {ImageData} imageData - The ImageData object (should be DRAWING_RESOLUTION x DRAWING_RESOLUTION).
 * @returns {Array<Array<number>>} - A 2D array representing drawingData with palette indices.
 */
function mapImageDataToPalette(imageData) {
    const { data, width, height } = imageData;
    if (width !== DRAWING_RESOLUTION || height !== DRAWING_RESOLUTION) {
        console.warn(`ImageImport: ImageData dimensions (${width}x${height}) do not match DRAWING_RESOLUTION (${DRAWING_RESOLUTION}). Results may be incorrect.`);
    }

    // Create an RGB buffer for processing the dithering
    const rgbBuffer = new Array(height);
    for (let y = 0; y < height; y++) {
        rgbBuffer[y] = new Array(width);
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            rgbBuffer[y][x] = {
                r: data[i],
                g: data[i + 1],
                b: data[i + 2],
                a: data[i + 3]  // Store alpha channel
            };
        }
    }

    // Output buffer for palette indices
    const mappedData = Array.from({ length: DRAWING_RESOLUTION }, () =>
        Array(DRAWING_RESOLUTION).fill(0) // Initialize with default floor index 0
    );

    // Apply different approaches based on dithering setting
    if (ditheringEnabled) {
        // Apply Floyd-Steinberg dithering
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const oldPixel = rgbBuffer[y][x];
                
                // Check for transparency - map fully transparent pixels to hole
                let closestIndex;
                if (oldPixel.a < 128) {
                    // Transparent pixel - map to hole
                    if (HOLE_INDEX >= 0) {
                        closestIndex = HOLE_INDEX;
                    } else {
                        closestIndex = findClosestPaletteColorIndex(oldPixel.r, oldPixel.g, oldPixel.b);
                    }
                } else {
                    // Regular color mapping for non-transparent pixels
                    closestIndex = findClosestPaletteColorIndex(oldPixel.r, oldPixel.g, oldPixel.b);
                }
                
                mappedData[y][x] = closestIndex;
                
                // Get RGB of the chosen palette color
                const paletteColor = paletteRgbCache[closestIndex].rgb;
                if (!paletteColor) continue; // Skip if no valid color found
                
                // Calculate quantization error
                const errorR = oldPixel.r - paletteColor.r;
                const errorG = oldPixel.g - paletteColor.g;
                const errorB = oldPixel.b - paletteColor.b;

                // Distribute error to neighboring pixels according to Floyd-Steinberg
                if (x + 1 < width) {
                    distributeError(rgbBuffer, x + 1, y, errorR, errorG, errorB, 7/16);
                }
                if (y + 1 < height) {
                    if (x > 0) {
                        distributeError(rgbBuffer, x - 1, y + 1, errorR, errorG, errorB, 3/16);
                    }
                    distributeError(rgbBuffer, x, y + 1, errorR, errorG, errorB, 5/16);
                    if (x + 1 < width) {
                        distributeError(rgbBuffer, x + 1, y + 1, errorR, errorG, errorB, 1/16);
                    }
                }
            }
        }
    } else {
        // Simple direct mapping without dithering
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pixel = rgbBuffer[y][x];
                
                // Check for transparency - map fully transparent pixels to hole
                if (pixel.a < 128) {
                    // Transparent pixel - map to hole
                    if (HOLE_INDEX >= 0) {
                        mappedData[y][x] = HOLE_INDEX;
                    } else {
                        mappedData[y][x] = findClosestPaletteColorIndex(pixel.r, pixel.g, pixel.b);
                    }
                } else {
                    // Regular color mapping for non-transparent pixels
                    mappedData[y][x] = findClosestPaletteColorIndex(pixel.r, pixel.g, pixel.b);
                }
            }
        }
    }

    return mappedData;
}

/**
 * Distributes error to a neighboring pixel in the Floyd-Steinberg dithering algorithm
 * @param {Array<Array<{r: number, g: number, b: number, a: number}>>} buffer - RGB buffer
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} errorR - Red error component
 * @param {number} errorG - Green error component
 * @param {number} errorB - Blue error component
 * @param {number} factor - Error distribution factor
 */
function distributeError(buffer, x, y, errorR, errorG, errorB, factor) {
    buffer[y][x].r = Math.min(255, Math.max(0, buffer[y][x].r + errorR * factor));
    buffer[y][x].g = Math.min(255, Math.max(0, buffer[y][x].g + errorG * factor));
    buffer[y][x].b = Math.min(255, Math.max(0, buffer[y][x].b + errorB * factor));
}

/**
 * Processes an image file, scales it, maps colors to the palette, and calls a callback.
 * @param {File} file - The image file selected by the user.
 * @param {function(Array<Array<number>>)} callback - Function to call with the processed drawingData.
 * @param {function(string)} onError - Function to call with an error message.
 */
function processImageFile(file, callback, onError) {
    if (!file.type.startsWith('image/')) {
        onError("Invalid file type. Please select an image.");
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Create offscreen canvas for scaling and color mapping
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = DRAWING_RESOLUTION;
            offscreenCanvas.height = DRAWING_RESOLUTION;
            const ctx = offscreenCanvas.getContext('2d');
            if (!ctx) {
                onError("Could not create canvas context for image processing.");
                return;
            }

            // Draw the image scaled onto the canvas
            // Disabling image smoothing can sometimes help preserve sharp edges
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, DRAWING_RESOLUTION, DRAWING_RESOLUTION);

            try {
                // Get pixel data
                const imageData = ctx.getImageData(0, 0, DRAWING_RESOLUTION, DRAWING_RESOLUTION);
                // Map colors to palette
                const mappedDrawingData = mapImageDataToPalette(imageData);
                // Call the success callback
                callback(mappedDrawingData);
            } catch (error) {
                // Catch potential security errors with getImageData (though less likely with FileReader)
                console.error("Error processing image data:", error);
                onError("Error processing image data. The image might be corrupted or in an unsupported format.");
            }
        };
        img.onerror = () => {
            onError("Could not load the selected image file.");
        };
        img.src = e.target.result; // Set image source to the data URL
    };
    reader.onerror = () => {
        onError("Could not read the selected file.");
    };

    reader.readAsDataURL(file); // Read the file as a data URL
}

// --- Initialization ---

/**
 * Sets up the event listeners for the image import button and file input.
 * @param {HTMLInputElement} inputElement - The hidden file input element.
 * @param {HTMLButtonElement} buttonElement - The button that triggers the file input.
 * @param {function(Array<Array<number>>)} onImageImported - Callback function when image is processed.
 */
export function initImageImport(inputElement, buttonElement, onImageImported) {
    if (!inputElement || !buttonElement || !onImageImported) {
        console.error("ImageImport Init Error: Missing required elements or callback.");
        return;
    }

    // Trigger file input when the button is clicked
    buttonElement.addEventListener('click', () => {
        inputElement.value = null; // Reset input to allow selecting the same file again
        inputElement.click();
    });

    // Handle file selection
    inputElement.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (file) {
            // Show loading indicator? (Optional)
            buttonElement.textContent = 'Loading...';
            buttonElement.disabled = true;

            processImageFile(
                file,
                (processedData) => { // Success callback
                    onImageImported(processedData);
                    // Reset button state
                    buttonElement.textContent = 'Import Img';
                    buttonElement.disabled = false;
                },
                (errorMessage) => { // Error callback
                    alert(`Image Import Error: ${errorMessage}`);
                    console.error(`Image Import Error: ${errorMessage}`);
                    // Reset button state
                    buttonElement.textContent = 'Import Img';
                    buttonElement.disabled = false;
                }
            );
        }
    });

    console.log("Image import functionality initialized.");
}