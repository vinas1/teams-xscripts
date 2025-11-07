// (c) 2025 Josh Davis https://vinas1.github.io 
// Quality checks verified on Chrome version 141.0.7390.123 (Official Build) (64-bit)
console.log("\n--- See README.md for usage instructions ---");
// Initialization: Clear previous transcripts on script load
// This ensures a fresh start for each session the script is injected.
if (localStorage.getItem("transcripts") !== null) {
    localStorage.removeItem("transcripts");
}

// In-memory array to store processed transcripts.
// It's initialized from localStorage if available, otherwise it's empty.
const transcriptArray = JSON.parse(localStorage.getItem("transcripts")) || [];

/**
 * Processes a single transcript DOM element, extracts its data,
 * and adds/updates it in the global transcriptArray.
 * Logs new entries to the console.
 * @param {Element} transcriptElement The DOM element representing a single chat message compact.
 * @returns {boolean} True if transcriptArray was modified (new entry added or existing updated), false otherwise.
 */
function processAndStoreTranscript(transcriptElement) {
    // Extract unique ID for the transcript entry
    const IDElement = transcriptElement.querySelector('[data-tid="closed-captions-v2-items-renderer"]');
    const ID = IDElement ? IDElement.getAttribute('data-lpc-hover-target-id') : null;

    // If no ID can be extracted, this element is not a valid transcript we track.
    if (!ID) {
        return false;
    }

    // Extract Name and Text from within the 'body' section of the transcript element
    const bodyDiv = transcriptElement.querySelector('.fui-ChatMessageCompact__body');
    let Name = 'Unknown Speaker'; // Default name if not found
    let Text = ''; // Default text if not found

    if (bodyDiv) {
        const NameElement = bodyDiv.querySelector('[data-tid="author"]');
        Name = NameElement ? NameElement.innerText.trim() : 'Unknown Speaker'; // Trim whitespace

        const TextElement = bodyDiv.querySelector('[data-tid="closed-caption-text"]');
        Text = TextElement ? TextElement.innerText.trim() : ''; // Trim whitespace
    }

    // Generate a timestamp for the transcript entry
    const Time = new Date().toISOString().replace('T', ' ').slice(0, -1);

    // Only proceed if we have a valid, non-empty Name and Text.
    // This prevents logging/storing partial or empty transcript entries.
    if (Name !== 'Unknown Speaker' && Text !== '') {
        const existingIndex = transcriptArray.findIndex(t => t.ID === ID);

        if (existingIndex > -1) {
            // If the entry already exists, update it only if the text has changed.
            if (transcriptArray[existingIndex].Text !== Text) {
                transcriptArray[existingIndex] = { Name, Text, Time, ID };
                return true; // Indicate that an update occurred
            }
        } else {
            // If it's a new entry, add it to the array and log to console.
            console.log({ Name, Text, Time, ID }); // Only log new, valid entries
            transcriptArray.push({ Name, Text, Time, ID });
            return true; // Indicate that a new entry was added
        }
    }
    return false; // No change or invalid entry, so no modification to transcriptArray
}

/**
 * Callback for the MutationObserver to efficiently handle newly added DOM nodes.
 * @param {Array<MutationRecord>} mutations List of mutations observed.
 */
const observerCallback = (mutations) => {
    let changed = false; // Flag to track if any changes occurred that require localStorage update
    mutations.forEach(mutation => {
        // We are interested in 'childList' mutations, specifically when nodes are added.
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
                // Ensure the added node is an element (not just text or comment node)
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Check if the added node itself is a 'fui-ChatMessageCompact'
                    if (node.classList && node.classList.contains('fui-ChatMessageCompact')) {
                        if (processAndStoreTranscript(node)) {
                            changed = true;
                        }
                    }
                    // Also query for 'fui-ChatMessageCompact' elements within the added node's subtree.
                    // This handles cases where a larger parent container of messages is added to the DOM.
                    const containedMessages = node.querySelectorAll('.fui-ChatMessageCompact');
                    containedMessages.forEach(msg => {
                        if (processAndStoreTranscript(msg)) {
                            changed = true;
                        }
                    });
                }
            });
        }
    });

    // If any transcript entries were added or updated during this observation cycle, save to localStorage.
    if (changed) {
        localStorage.setItem("transcripts", JSON.stringify(transcriptArray));
    }
};

// Set up MutationObserver to efficiently detect new chat messages
const observer = new MutationObserver(observerCallback);
const observerTarget = document.body; // Observe the entire document body for changes
observer.observe(observerTarget, { childList: true, subtree: true }); // Monitor for direct child additions/removals and changes anywhere in the subtree


// Set up a less frequent setInterval as a fallback.
// This periodically scans all current messages to catch any missed updates (e.g., text corrections)
// or situations where MutationObserver might not trigger for very subtle changes.
setInterval(() => {
    let changed = false;
    // Get all 'fui-ChatMessageCompact' elements currently in the DOM.
    const allCurrentTranscripts = document.querySelectorAll('.fui-ChatMessageCompact');
    allCurrentTranscripts.forEach(transcriptElement => {
        // Call processAndStoreTranscript which handles both new additions and updates to existing entries.
        if (processAndStoreTranscript(transcriptElement)) {
            changed = true;
        }
    });

    // If any changes were detected during this full scan, save to localStorage.
    if (changed) {
        localStorage.setItem("transcripts", JSON.stringify(transcriptArray));
    }
}, 15000); // Run every 15 seconds to balance responsiveness and performance.


// Initial scan on script load: to capture any existing transcripts immediately when the script is injected.
window.addEventListener('load', () => {
    let changed = false;
    const initialTranscripts = document.querySelectorAll('.fui-ChatMessageCompact');
    initialTranscripts.forEach(transcriptElement => {
        if (processAndStoreTranscript(transcriptElement)) {
            changed = true;
        }
    });
    if (changed) {
        localStorage.setItem("transcripts", JSON.stringify(transcriptArray));
    }
});


/**
 * getTXT function: Responsible for retrieving the stored transcript and triggering a download.
 * Includes a robust download method with a fallback for security-restricted environments.
 */
function getTXT() {
    // Safely retrieve transcripts from localStorage. If null, default to an empty array.
    let transcripts = JSON.parse(localStorage.getItem('transcripts')) || [];

    // If no transcripts are found after retrieval, inform the user and exit.
    if (transcripts.length === 0) {
        console.warn("No transcripts found in storage. Please ensure captions are enabled and the script has captured some text before trying to download.");
        alert("No transcripts found to download. Please make sure live captions are turned on in Microsoft Teams and that the script has had time to capture some text.");
        return; // Exit the function as there's nothing to download.
    }

    // Remove the internal 'ID' property before formatting for the TXT file (as it's not needed in the output)
    transcripts = transcripts.map(({ ID, ...rest }) => rest);

    // Format the transcripts into the desired YAML-like string
    let yamlTranscripts = '';
    transcripts.forEach(transcript => {
        yamlTranscripts += `(Name)= ${transcript.Name} (Text)= ${transcript.Text} (Time)= ${transcript.Time}\n`;
    });

    // Create a file name based on the document title, cleaning up Teams-specific parts and special characters
    let title = document.title.replace("__Microsoft_Teams", '').replace(/[^a-z0-9 ]/gi, '');
    const fileName = "transcript - " + title.trim() + ".txt";

    // --- Robust Download Logic ---
    try {
        // 1. Attempt to create a Blob and a URL for more reliable programmatic download
        const blob = new Blob([yamlTranscripts], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", url);
        downloadAnchorNode.setAttribute("download", fileName);
        downloadAnchorNode.style.display = 'none'; // Hide the anchor element

        document.body.appendChild(downloadAnchorNode); // Temporarily append to body to make it clickable
        downloadAnchorNode.click(); // Programmatically click the anchor to trigger the download

        // Clean up: revoke the object URL and remove the anchor after a short delay
        // This is important to release memory and DOM elements.
        setTimeout(() => {
            URL.revokeObjectURL(url);
            document.body.removeChild(downloadAnchorNode);
        }, 100); // A small delay to ensure the download intent is registered by the browser before cleanup.

    } catch (e) {
        // 2. Fallback if the automatic download fails (e.g., due to security restrictions)
        console.error("Automatic download failed:", e);
        const dataStr = "data:text/yaml;charset=utf-8," + encodeURIComponent(yamlTranscripts);
        console.log("\n--- Manual Download Instructions ---");
        console.log("Automatic download was blocked. You can manually download the transcript by following these steps:");
        console.log("1. Copy the following Data URI (it starts with 'data:text/yaml;charset=utf-8,...').");
        console.log("2. Paste it directly into your browser's address bar and press Enter.");
        console.log("3. Your browser should then prompt you to save the file.");
        console.log("----------------------------------\n");
        console.log("Data URI for your transcript:\n" + dataStr);
        alert("Automatic download failed. Please check the browser's console (F12, then look at 'Console' tab) for instructions on how to manually download the transcript by copying a Data URI.");
    }
}