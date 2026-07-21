// background.js

// Cleanup any old cached failures on startup
cleanupFailedCache();
chrome.runtime.onStartup.addListener(cleanupFailedCache);
chrome.runtime.onInstalled.addListener(cleanupFailedCache);

function cleanupFailedCache() {
  chrome.storage.local.get(null, (items) => {
    const keysToRemove = [];
    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith("jisho_cache_")) {
        if (value && value.senses && value.senses.some(s => s.definitions && s.definitions.includes("No translation found"))) {
          keysToRemove.push(key);
        }
      }
    }
    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove);
    }
  });
}

// Listen for messages from the content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyze-sentence") {
    analyzeSentence(request.text)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }

  if (request.action === "jisho-lookup") {
    jishoLookup(request.word)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }

  if (request.action === "jisho-lookup-batch") {
    (async () => {
      const responseData = {};
      for (const w of request.words) {
        try {
          responseData[w] = await jishoLookup(w);
        } catch (e) {
          responseData[w] = null;
        }
      }
      sendResponse({ success: true, data: responseData });
    })().catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }
});

/**
 * Fetches sentence translation and romaji transliteration from Google Translate.
 */
async function analyzeSentence(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
  const response = await fetchWithTimeout(url, { timeout: 3000 });
  if (!response.ok) {
    throw new Error(`Google Translate API failed with status ${response.status}`);
  }
  
  const json = await response.json();
  
  let translation = "";
  let romaji = "";
  
  if (json && json[0]) {
    // Compile translation from segments
    translation = json[0]
      .map(segment => segment[0])
      .filter(Boolean)
      .join('');
      
    // Extract romaji transliteration
    for (const segment of json[0]) {
      if (segment[0] === null && segment[1] === null) {
        romaji = segment[3] || segment[2] || "";
        break;
      }
    }
  }
  
  return {
    originalText: text,
    translation: translation || "Translation unavailable",
    romaji: romaji || "Romaji reading unavailable"
  };
}

/**
 * Performs a Jisho word search, checks storage cache first.
 */
async function jishoLookup(word) {
  const cacheKey = `jisho_cache_${word}`;
  
  // Try retrieving from chrome.storage.local cache
  const cached = await new Promise(resolve => {
    chrome.storage.local.get([cacheKey], result => {
      resolve(result[cacheKey]);
    });
  });
  
  if (cached) {
    return cached;
  }
  
  // Fetch from Jisho API with timeout
  const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`;
  const response = await fetchWithTimeout(url, { timeout: 10000 });
  if (!response.ok) {
    throw new Error(`Jisho API failed with status ${response.status}`);
  }
  
  const json = await response.json();
  let resultData = null;
  
  if (json.data && json.data.length > 0) {
    // Find the most appropriate entry (often the first is best, but let's double check matching spelling if possible)
    const entry = json.data[0];
    
    const japaneseWord = entry.japanese[0].word || word;
    const reading = entry.japanese[0].reading || "";
    
    // Parse senses
    const senses = entry.senses.map(sense => ({
      pos: sense.parts_of_speech ? sense.parts_of_speech.join(", ") : "",
      definitions: sense.english_definitions || []
    })).filter(sense => sense.definitions.length > 0);
    
    resultData = {
      word: word,
      dictionaryWord: japaneseWord,
      reading: reading,
      senses: senses
    };
  } else {
    // If not found in Jisho, immediately return a safe default without hitting Google Translate.
    // This prevents concurrent Google Translate lookups from triggering API rate limits (429).
    resultData = {
      word: word,
      dictionaryWord: word,
      reading: word,
      senses: [
        {
          pos: "Unknown",
          definitions: ["No translation found"]
        }
      ]
    };
  }
  
  // Store in cache only if it's not a failed definition
  const isFailed = resultData.senses.some(s => s.definitions && s.definitions.includes("No translation found"));
  if (!isFailed) {
    await new Promise(resolve => {
      chrome.storage.local.set({ [cacheKey]: resultData }, () => {
        resolve();
      });
    });
  }
  
  return resultData;
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 10000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}
