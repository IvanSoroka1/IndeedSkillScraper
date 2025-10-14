//Listen for browser action click to trigger scraping in active tab
browser.browserAction.onClicked.addListener(async (tab) => {
    if (!tab.id) return;

    try {
        const state = await browser.storage.local.get("scraping");
        const isScraping = state.scraping || false;

        if (isScraping) {
            // Already scraping → stop it
            await browser.storage.local.set({ scraping: false });
            console.log("🛑 Scraping was active. Stopped scraping.");
        } else {
            // Not scraping → start it
            await browser.tabs.sendMessage(tab.id, { action: "startScrape" });
            console.log("✅ Started scraping.");
        }
    } catch (error) {
        console.error("Error accessing storage or sending message:", error);
    }
});



  
//   browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     if (message.action === "setScraping") {
//       browser.storage.local.set({ scraping: message.value });
//       return;
//     }
  
//     if (message.action === "getScraping") {
//       browser.storage.local.get("scraping").then(data => {
//         sendResponse(data);
//       });
//       return true; // Keep the message channel open for async response
//     }
//   });