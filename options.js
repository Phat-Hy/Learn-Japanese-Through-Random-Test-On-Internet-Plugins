// options.js

// DOM Elements
const modeClick = document.getElementById("mode-click");
const modeAuto = document.getElementById("mode-auto");
const showRomajiCheck = document.getElementById("show-romaji");
const cacheCount = document.getElementById("cache-count");
const clearCacheBtn = document.getElementById("clear-cache");
const saveBtn = document.getElementById("save-button");
const statusMsg = document.getElementById("status");

// Load stored options on startup
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["autoTrigger", "showRomaji"], (settings) => {
    // Default to click mode (autoTrigger: false)
    if (settings.autoTrigger === true) {
      modeAuto.checked = true;
    } else {
      modeClick.checked = true;
    }
    
    // Default to showRomaji: true
    showRomajiCheck.checked = settings.showRomaji !== false;
  });
  
  updateCacheStats();
});

// Save Settings Button
saveBtn.addEventListener("click", () => {
  const autoTrigger = modeAuto.checked;
  const showRomaji = showRomajiCheck.checked;
  
  chrome.storage.local.set({ autoTrigger, showRomaji }, () => {
    // Show success message
    statusMsg.style.opacity = "1";
    setTimeout(() => {
      statusMsg.style.opacity = "0";
    }, 2000);
  });
});

// Clear Cache Button
clearCacheBtn.addEventListener("click", () => {
  chrome.storage.local.get(null, (items) => {
    const keysToRemove = Object.keys(items).filter(key => key.startsWith("jisho_cache_"));
    
    if (keysToRemove.length === 0) {
      alert("Cache is already empty.");
      return;
    }
    
    if (confirm(`Are you sure you want to delete ${keysToRemove.length} cached words?`)) {
      chrome.storage.local.remove(keysToRemove, () => {
        updateCacheStats();
        alert("Cache cleared successfully.");
      });
    }
  });
});

/**
 * Calculates and displays cache counts
 */
function updateCacheStats() {
  chrome.storage.local.get(null, (items) => {
    const cacheKeys = Object.keys(items).filter(key => key.startsWith("jisho_cache_"));
    cacheCount.textContent = `${cacheKeys.length} word definitions cached`;
  });
}
