// buttonHandlers.js - Centralizes button event handlers to avoid initialization order issues

import { updateResetButtonVisual } from './ui.js';
import { exportCurrentSquareImage, exportWholeMapImage } from './imageExporter.js';
import { getPlayerMazeSquare } from './mazeUtils.js';
import { getDrawingMode, getCurrentDrawingSquare, getDrawingData } from 'drawing';
import { teleportToStart } from './teleportUtils.js';
import { initChatToggle } from './chatToggle.js';

let roomRef;
let infoModalRef;
let statsModalRef;
let mazeViewerModalRef = null; // Reference for the maze viewer modal
let homeButtonListenerAdded = false;
let pastMazeSubscription = null; // Subscription unsubscribe function

// Function to safely get room reference
export function setRoomReference(_room) {
    roomRef = _room;
    subscribeToPastMazes(); // Subscribe when roomRef is set
}

// --- Past Maze Subscription ---
function subscribeToPastMazes() {
    if (pastMazeSubscription) {
        pastMazeSubscription();
        pastMazeSubscription = null;
    }
    if (!roomRef) return;
    pastMazeSubscription = roomRef.collection('pastMaze_v1').subscribe((pastMazes) => {
        if (statsModalRef && statsModalRef.style.display === 'block') {
            displayPastMazes(pastMazes);
        }
    });
    console.log("Subscribed to past maze updates.");
}

// ------- Maze Viewer Modal Logic --------

// Create the maze viewer modal if it doesn't exist
function createMazeViewerModal() {
    if (mazeViewerModalRef) return mazeViewerModalRef;
    mazeViewerModalRef = document.createElement('div');
    mazeViewerModalRef.id = 'maze-viewer-modal';
    mazeViewerModalRef.className = 'modal';
    mazeViewerModalRef.innerHTML = `
        <div class="modal-content" style="background:transparent; box-shadow:none; max-width:none; padding:0;">
            <button class="modal-close" id="maze-viewer-close" style="z-index:20; position:absolute; top:10px; right:18px; background:rgba(0,0,0,0.4);color:#fff; border-radius:100%; width:36px; height:36px; font-size:32px;">&times;</button>
            <div style="display:flex; align-items:center; justify-content:center; width:100vw; height:100vh;">
                <img id="maze-viewer-img" src="" style="max-width:96vw; max-height:88vh; border-radius:8px; background:white; box-shadow:0 2px 24px rgba(0,0,0,0.45);" alt="Past Maze Image">
            </div>
            <div id="maze-viewer-info" style="position:absolute; bottom:18px; left:0; right:0; text-align:center; color:white; text-shadow:0 0 7px #222; background:rgba(0,0,0,0.4); font-size:16px; padding:5px 12px; border-radius:0 0 8px 8px;"></div>
        </div>
    `;
    document.body.appendChild(mazeViewerModalRef);

    // Close modal on close button or background click
    mazeViewerModalRef.querySelector('#maze-viewer-close').addEventListener('click', closeMazeViewerModal);
    mazeViewerModalRef.addEventListener('click', (event) => {
        if (event.target === mazeViewerModalRef) closeMazeViewerModal();
    });
    return mazeViewerModalRef;
}

function openMazeViewerModal(imageUrl, infoText = "") {
    const modal = createMazeViewerModal();
    const img = modal.querySelector('#maze-viewer-img');
    const info = modal.querySelector('#maze-viewer-info');
    img.src = imageUrl;
    img.alt = infoText || "Past Maze Image";
    info.textContent = infoText;
    modal.style.display = 'block';
}

function closeMazeViewerModal() {
    if (mazeViewerModalRef) {
        mazeViewerModalRef.style.display = 'none';
        mazeViewerModalRef.querySelector('#maze-viewer-img').src = '';
    }
}

// -----------------------------------------

export function initButtonHandlers() {
    // --- Info Modal Button Logic ---
    const infoButton = document.getElementById('info-button');
    infoModalRef = document.getElementById('info-modal');
    const closeInfoModalButton = infoModalRef?.querySelector('.modal-close');

    if (infoButton && infoModalRef && closeInfoModalButton) {
        infoButton.addEventListener('click', openInfoModal);
        closeInfoModalButton.addEventListener('click', closeInfoModal);
        infoModalRef.addEventListener('click', (event) => {
            if (event.target === infoModalRef) {
                closeInfoModal();
            }
        });
    } else {
        console.error("ButtonHandlers: Could not find info modal elements");
    }

    // --- Stats Modal Button Logic ---
    const statsButton = document.getElementById('stats-button');
    statsModalRef = document.getElementById('stats-modal');
    const closeStatsModalButton = statsModalRef?.querySelector('.modal-close');

    if (statsButton && statsModalRef && closeStatsModalButton) {
        statsButton.addEventListener('click', openStatsModal);
        closeStatsModalButton.addEventListener('click', closeStatsModal);
        statsModalRef.addEventListener('click', (event) => {
            if (event.target === statsModalRef) {
                closeStatsModal();
            }
        });
    } else {
        console.error("ButtonHandlers: Could not find stats modal elements");
    }

    // --- Reset Button Logic ---
    const resetButton = document.getElementById('reset-button');
    if (resetButton) {
        resetButton.addEventListener('click', handleResetButtonClick);
    } else {
        console.error("ButtonHandlers: Could not find reset button");
    }

    // --- Save Image Button Logic ---
    const saveImageButton = document.getElementById('save-image-button');
    if (saveImageButton) {
        saveImageButton.addEventListener('click', handleSaveImageClick);
    } else {
        console.error("ButtonHandlers: Could not find save image button");
    }

    // --- Chat Toggle Logic ---
    initChatToggle();

    // --- Maze Viewer Modal (create up front) ---
    createMazeViewerModal();

    console.log("ButtonHandlers: All button handlers initialized");
}

// --- Info Modal Functions ---
function openInfoModal() {
    if (infoModalRef) infoModalRef.style.display = 'block';
}

function closeInfoModal() {
    if (infoModalRef) infoModalRef.style.display = 'none';
}

// --- Stats Modal Functions ---
function openStatsModal() {
    calculateAndDisplayStats(); // Calculate current stats
    // Fetch and display past mazes when modal opens
    if (roomRef) {
         const pastMazes = roomRef.collection('pastMaze_v1').getList();
         displayPastMazes(pastMazes); // Display initially fetched list
    } else {
         displayPastMazes([]); // Show empty state if no roomRef
    }
    if (statsModalRef) statsModalRef.style.display = 'block';
}

function closeStatsModal() {
    if (statsModalRef) statsModalRef.style.display = 'none';
}

// --- Reset Button Function ---
function handleResetButtonClick() {
    if (!roomRef) {
        console.error("ButtonHandlers: Room reference not available for reset vote");
        return;
    }

    const currentPresence = roomRef.presence[roomRef.clientId] || {};
    const currentVote = currentPresence.voteToReset === true;
    const newVote = !currentVote;

    console.log(`ButtonHandlers: Player ${roomRef.clientId} ${newVote ? 'voted to reset' : 'revoked reset vote'}.`);
    roomRef.updatePresence({ voteToReset: newVote });
    updateResetButtonVisual(newVote);
}

// --- Save Image Function ---
async function handleSaveImageClick() {
    if (!roomRef) {
        console.error("ButtonHandlers: Room reference not available for save image");
        return;
    }

    const saveWhole = window.confirm("Save entire discovered map as image? (Cancel to save only the current square)");

    try {
        if (saveWhole) {
            // Show a temporary message as this might take time
            const tempMsg = document.createElement('div');
            tempMsg.textContent = 'Generating whole map image... Please wait.';
            tempMsg.style.position = 'fixed';
            tempMsg.style.top = '50%';
            tempMsg.style.left = '50%';
            tempMsg.style.transform = 'translate(-50%, -50%)';
            tempMsg.style.padding = '20px';
            tempMsg.style.background = 'rgba(0,0,0,0.8)';
            tempMsg.style.color = 'white';
            tempMsg.style.borderRadius = '5px';
            tempMsg.style.zIndex = '9999';
            document.body.appendChild(tempMsg);

            // Use setTimeout to allow the message to render before blocking thread
            setTimeout(async () => {
                try {
                    await exportWholeMapImage(roomRef);
                } catch (err) {
                    console.error("Error generating whole map image:", err);
                    alert("Error generating whole map image. It might be too large. Check console for details.");
                } finally {
                    // Remove the message
                    if (tempMsg.parentNode) {
                        tempMsg.parentNode.removeChild(tempMsg);
                    }
                }
            }, 50); // Short delay

        } else {
            const player = roomRef.presence[roomRef.clientId];
            if (!player || player.x === undefined || player.y === undefined) {
                alert("Could not determine your current location to save the square.");
                return;
            }
            const { mazeX, mazeY } = getPlayerMazeSquare(player);

            // Pass drawing state if currently drawing this square
            let currentDrawing = null;
            if (getDrawingMode()) {
                const drawingSquare = getCurrentDrawingSquare();
                if (drawingSquare && drawingSquare.x === mazeX && drawingSquare.y === mazeY) {
                    currentDrawing = {
                        x: mazeX,
                        y: mazeY,
                        data: getDrawingData()
                    };
                }
            }
            await exportCurrentSquareImage(roomRef, mazeX, mazeY, currentDrawing);
        }
    } catch (error) {
        console.error("Error saving image:", error);
        alert("An error occurred while saving the image. Check the console for details.");
    }
}

// --- Stats Calculation & Display ---
function calculateAndDisplayStats() {
    if (!roomRef) {
        console.error("ButtonHandlers: Room reference not available for stats");
        return;
    }

    const mazeStatsContent = document.getElementById('maze-stats-content');
    const leaderboardContent = document.getElementById('leaderboard-content');
    // Note: Past mazes are handled by displayPastMazes

    if (!mazeStatsContent || !leaderboardContent) {
        console.error("ButtonHandlers: Could not find stats modal content elements");
        return;
    }

    // Get tiles from database
    const tiles = roomRef.collection('tile_v1').getList();
    const peers = roomRef.peers || {};

    // 1. Maze Size and Bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let totalSquares = 0;

    tiles.forEach(tile => {
        if (tile.mazeX !== undefined && tile.mazeY !== undefined && tile.data) {
            totalSquares++;
            const x = tile.mazeX;
            const y = tile.mazeY;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    });

    let mazeStatsHtml = `<p>Total Claimed Squares: ${totalSquares}</p>`;
    if (totalSquares > 0) {
        mazeStatsHtml += `<p>Bounds (X): ${minX} to ${maxX}</p>`;
        mazeStatsHtml += `<p>Bounds (Y): ${minY} to ${maxY}</p>`;
    } else {
        mazeStatsHtml += `<p>The maze is empty!</p>`;
    }
    mazeStatsContent.innerHTML = mazeStatsHtml;

    // 2. Leaderboard (Top Contributors)
    const ownerCounts = {};
    tiles.forEach(tile => {
        if (tile.username && tile.username !== 'System') {
            const username = tile.username;

            if (!ownerCounts[username]) {
                ownerCounts[username] = { count: 0, username: username };
            }
            ownerCounts[username].count += 1;
        }
    });

    const leaderboard = Object.entries(ownerCounts)
        .map(([username, data]) => ({
            username: data.username,
            count: data.count
        }))
        .sort((a, b) => b.count - a.count) // Sort descending by count
        .slice(0, 10); // Take top 10

    let leaderboardHtml = '';
    if (leaderboard.length > 0) {
        leaderboardHtml += '<ol>';
        leaderboard.forEach(entry => {
            leaderboardHtml += `<li>${entry.username}: ${entry.count} squares</li>`;
        });
        leaderboardHtml += '</ol>';
    } else {
        leaderboardHtml = '<p>No contributions tracked yet.</p>';
    }
    leaderboardContent.innerHTML = leaderboardHtml;
}

// --- NEW: Display Past Mazes ---
/**
 * Renders the past maze thumbnails in the stats modal.
 * @param {Array<object>} pastMazes - Array of past maze records from the database.
 */
function displayPastMazes(pastMazes) {
    const gallery = document.getElementById('past-mazes-gallery');
    if (!gallery) {
        console.error("ButtonHandlers: Could not find past mazes gallery element.");
        return;
    }

    gallery.innerHTML = ''; // Clear previous content

    if (!pastMazes || pastMazes.length === 0) {
        gallery.innerHTML = '<p>No past mazes have been saved yet.</p>';
        return;
    }

    // The database query returns newest first, so we don't need to reverse.
    pastMazes.forEach(mazeRecord => {
        if (!mazeRecord || !mazeRecord.imageUrl || !mazeRecord.created_at) {
            console.error("ButtonHandlers: Invalid past maze record:", mazeRecord);
            return;
        }

        // --- Thumbnail container (for clickability) ---
        const thumbContainer = document.createElement('div');
        thumbContainer.className = 'past-maze-thumbnail';
        thumbContainer.style.cursor = 'pointer'; // Ensure pointer cursor

        // --- Thumbnail image ---
        const thumbnail = document.createElement('img');
        thumbnail.src = mazeRecord.imageUrl;
        thumbnail.alt = `Past maze from ${new Date(mazeRecord.created_at).toLocaleString()}`;
        thumbnail.style.width = '100%';
        thumbnail.style.height = '100%';
        thumbnail.style.objectFit = 'cover';

        // --- Date label (bottom of thumbnail) ---
        const dateSpan = document.createElement('span');
        const date = new Date(mazeRecord.created_at);
        dateSpan.textContent = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;

        // --- Compose container ---
        thumbContainer.appendChild(thumbnail);
        thumbContainer.appendChild(dateSpan);

        // --- On Click: Open full screen viewer modal ---
        thumbContainer.addEventListener('click', () => {
            // Info text: Date, totalSquares, bounds, filename, etc.
            let info = '';
            if (mazeRecord.filename) {
                info += mazeRecord.filename + "  ";
            }
            if (mazeRecord.totalSquares) {
                info += `Squares: ${mazeRecord.totalSquares}  `;
            }
            if (mazeRecord.bounds) {
                const b = mazeRecord.bounds;
                info += `Bounds: (${b.minX},${b.minY})–(${b.maxX},${b.maxY})  `;
            }
            info += date.toLocaleString();
            openMazeViewerModal(mazeRecord.imageUrl, info);
        });

        // --- Add to gallery ---
        gallery.appendChild(thumbContainer);
    });
}