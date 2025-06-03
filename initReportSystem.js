/**
 * initReportSystem.js - Initialize the report system and register event handlers
 * Created to reduce the size of reportSystem.js
 */

import { createReportModalHTML, createPlayerListItem, showReasonInput, showPlayerSelection } from './reportFormUI.js';

/**
 * Initializes the report system UI and event handlers
 * @param {object} room - The Websim room reference
 * @param {function} openReportModalCallback - Callback to open the report modal
 * @param {function} closeReportModalCallback - Callback to close the report modal
 */
export function initReportSystemUI(room, openReportModalCallback, closeReportModalCallback) {
    // Create the report UI elements if they don't exist
    if (!document.getElementById('report-modal')) {
        // Create Report Modal
        const reportModal = document.createElement('div');
        reportModal.id = 'report-modal';
        reportModal.className = 'modal';
        reportModal.innerHTML = createReportModalHTML();
        document.body.appendChild(reportModal);
    }

    // Set up button references and listeners
    const reportButtonRef = document.getElementById('report-button');
    const reportModalRef = document.getElementById('report-modal');
    const closeReportModalButtonRef = document.getElementById('close-report-modal');

    if (reportButtonRef) {
        reportButtonRef.addEventListener('click', openReportModalCallback);
    }

    if (closeReportModalButtonRef) {
        closeReportModalButtonRef.addEventListener('click', closeReportModalCallback);
    }

    if (reportModalRef) {
        reportModalRef.addEventListener('click', (event) => {
            if (event.target === reportModalRef) {
                closeReportModalCallback();
            }
        });
    }

    console.log("Report system UI initialized");
    
    return {
        reportModalRef,
        reportButtonRef,
        closeReportModalButtonRef
    };
}