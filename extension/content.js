const extractPageData = () => {
    const url = window.location.href;
    const pageTitle = document.title;
    
    // Grab all visible text currently rendered in the DOM body
    let rawText = document.body.innerText || "";
    
    // Clean up the text: split by spaces, remove empty strings, and join back together.
    // We avoid RegExp here to keep the parsing simple and straightforward.
    let words = rawText.split(' ');
    let cleanWords = words.filter(word => word.trim().length > 0);
    let cleanText = cleanWords.join(' ').toLowerCase();
    
    // Grab just the first 400 characters. 
    // Claude doesn't need the whole page to know what it's about, 
    // and sending less data saves you money and reduces latency.
    const pageSnippet = cleanText.substring(0, 400);
    
    return { url, pageTitle, pageSnippet };
};

const classifyCurrentPage = async () => {
    // Only run on actual web pages, ignore chrome:// settings pages
    if (!window.location.href.startsWith('http')) return;

    const pageData = extractPageData();
    console.log("FocalPoint: Checking page intent...");

    try {
        const response = await chrome.runtime.sendMessage({
            action: "CLASSIFY_PAGE",
            payload: {
                url: pageData.url,
                pageTitle: pageData.pageTitle,
                pageSnippet: pageData.pageSnippet
            }
        });

        if (response && response.decision) {
            console.log(`FocalPoint Decision: ${response.decision}. Reason: ${response.reason}`);
            
            if (response.decision === "BLOCK") {
                triggerBlockOverlay(response.reason);
            }
        } else if (response && response.error) {
            console.log("FocalPoint context:", response.error); // Usually "No active session"
        }
    } catch (error) {
        // This catch block handles the case where the extension is reloaded 
        // but the webpage hasn't been refreshed yet.
        console.log("FocalPoint: Could not connect to background script.");
    }
};

const triggerBlockOverlay = (reason) => {
    // We will build this UI injection next
    alert(`FOCALPOINT BLOCK: ${reason}`);
};

// --- Execute ---
// Adding a slight delay ensures the DOM has time to render its text 
// before we try to extract it, especially for React/Single Page Apps.
setTimeout(classifyCurrentPage, 1500);