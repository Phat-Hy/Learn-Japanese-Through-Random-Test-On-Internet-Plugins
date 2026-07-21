// content.js

let hostElement = null;
let shadowRoot = null;
let activeTriggerButton = null;
let currentSelectionText = "";

// Keep track of active definition index for each parsed word
// Keys: word, Values: active sense index (0-based)
let wordActiveSenseMap = {};
// Store current word details list for the active card
let currentWordDetailsList = [];

// Initialize listeners
document.addEventListener("mouseup", handleTextSelection);
document.addEventListener("keyup", handleTextSelection);

// Clean up trigger/card when clicking outside
document.addEventListener("mousedown", (e) => {
  if (hostElement && !e.target.closest("#learn-japanese-extension-host")) {
    removeOverlay();
  }
  if (activeTriggerButton && e.target !== activeTriggerButton) {
    removeTrigger();
  }
});

/**
 * Main selection listener
 */
function handleTextSelection(event) {
  const selection = window.getSelection();
  const text = selection.toString().trim();

  if (!text || !isJapanese(text)) {
    return;
  }

  currentSelectionText = text;

  // Check user settings for auto-trigger
  chrome.storage.local.get(["autoTrigger"], (settings) => {
    const isAuto = settings.autoTrigger === true;
    if (isAuto) {
      removeTrigger();
      showAnalysisCard(text, selection);
    } else {
      showTriggerButton(selection);
    }
  });
}

/**
 * Checks if a string contains Japanese characters (hiragana, katakana, kanji)
 */
function isJapanese(text) {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

/**
 * Removes the floating trigger button from the page
 */
function removeTrigger() {
  if (activeTriggerButton) {
    activeTriggerButton.remove();
    activeTriggerButton = null;
  }
}

/**
 * Removes the analysis overlay card from the page
 */
function removeOverlay() {
  if (hostElement) {
    hostElement.remove();
    hostElement = null;
    shadowRoot = null;
    wordActiveSenseMap = {};
    currentWordDetailsList = [];
  }
}

/**
 * Creates and shows a floating trigger button near the text selection
 */
function showTriggerButton(selection) {
  removeTrigger();

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  const button = document.createElement("button");
  button.className = "selection-trigger";
  button.style.top = `${rect.bottom + window.scrollY + 6}px`;
  button.style.left = `${Math.max(10, rect.left + window.scrollX + (rect.width / 2) - 18)}px`;
  
  // Custom SVG icon representing Japan/Study (Red Sun + brush symbol)
  button.innerHTML = `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="40" fill="#ef4444" />
      <path d="M50 25 L50 40 M30 45 L70 45 M50 45 L50 75 M35 60 L65 60" stroke="#ffffff" stroke-width="8" stroke-linecap="round" />
    </svg>
  `;

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    removeTrigger();
    showAnalysisCard(currentSelectionText, selection);
  });

  // Inject a small stylesheet for the trigger button itself in the main document if needed
  // But wait, to keep page styles clean, let's styles the button directly in JS or let it load
  // We'll style it in JS for simplicity, or inject a tiny style block.
  button.style.position = "absolute";
  button.style.zIndex = "100000";
  button.style.width = "32px";
  button.style.height = "32px";
  button.style.borderRadius = "50%";
  button.style.background = "rgba(15, 23, 42, 0.9)";
  button.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  button.style.cursor = "pointer";
  button.style.display = "flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.3)";
  button.style.padding = "4px";
  button.style.transition = "transform 0.1s ease";

  document.body.appendChild(button);
  activeTriggerButton = button;
}

/**
 * Creates the Shadow DOM host and fetches analysis data
 */
async function showAnalysisCard(text, selection) {
  removeOverlay();

  // Create host element
  hostElement = document.createElement("div");
  hostElement.id = "learn-japanese-extension-host";
  
  // Position wrapper relative to selection
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  hostElement.style.position = "absolute";
  hostElement.style.zIndex = "2147483647"; // Maximum z-index
  hostElement.style.top = `${rect.bottom + window.scrollY + 10}px`;
  
  // Constrain left positioning within viewport bounds
  const cardWidth = 480;
  const gap = 12;
  const leftPos = Math.max(10, Math.min(window.innerWidth - cardWidth - 20, rect.left + window.scrollX));
  hostElement.style.left = `${leftPos}px`;

  shadowRoot = hostElement.attachShadow({ mode: "open" });

  // Load stylesheet via link
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("content.css");
  shadowRoot.appendChild(link);

  // Render loading state
  const wrapper = document.createElement("div");
  wrapper.className = "overlay-wrapper";
  wrapper.innerHTML = `
    <div class="glass-card">
      <div class="japanese-display">Analyzing...</div>
    </div>
  `;
  shadowRoot.appendChild(wrapper);
  document.body.appendChild(hostElement);

  try {
    // 1. Get Translation & Romaji from background
    const sentenceResult = await sendMessageAsync({ action: "analyze-sentence", text });
    
    // 2. Segment original text with Intl.Segmenter
    const segmenter = new Intl.Segmenter("ja-JP", { granularity: "word" });
    const segments = Array.from(segmenter.segment(text));
    
    // Extract unique words to query Jisho
    const wordsToQuery = segments
      .filter(s => s.isWordLike && isJapanese(s.segment))
      .map(s => s.segment);
    const uniqueWords = [...new Set(wordsToQuery)];
    
    // 3. Look up all words concurrently
    const wordPromises = uniqueWords.map(word => 
      sendMessageAsync({ action: "jisho-lookup", word })
        .then(res => res.success ? res.data : null)
        .catch(() => null)
    );
    const wordResults = await Promise.all(wordPromises);
    currentWordDetailsList = wordResults.filter(Boolean);

    // Initialize sense map to 0 (default first meaning)
    currentWordDetailsList.forEach(detail => {
      wordActiveSenseMap[detail.word] = 0;
    });

    // 4. Render main overlay card
    renderCard(wrapper, segments, sentenceResult.data);
  } catch (error) {
    console.error("Analysis failed:", error);
    wrapper.innerHTML = `
      <div class="glass-card">
        <div class="japanese-display">Error</div>
        <div class="romaji-display">Failed to analyze Japanese text. Please try again.</div>
      </div>
    `;
  }
}

/**
 * Sends runtime messages wrapped in a Promise
 */
function sendMessageAsync(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(res);
      }
    });
  });
}

/**
 * Render the main Glass Card and set up handlers
 */
function renderCard(wrapper, segments, sentenceData) {
  // Reconstruct Japanese sentence with stacked word columns
  let annotatedSentence = "";
  segments.forEach(seg => {
    const text = seg.segment;
    if (seg.isWordLike && isJapanese(text)) {
      const detail = currentWordDetailsList.find(d => d.word === text);
      const activeSenseIdx = wordActiveSenseMap[text] || 0;
      const pos = (detail && detail.senses && detail.senses[activeSenseIdx]) ? detail.senses[activeSenseIdx].pos : "";
      const posClass = getWordClass(text, pos);
      
      const hasKanji = /[\u4E00-\u9FAF]/.test(text);
      const furigana = (hasKanji && detail && detail.reading) ? detail.reading : "";
      
      const wordReading = detail && detail.reading ? detail.reading : text;
      const romaji = kanaToRomaji(wordReading);
      
      annotatedSentence += `
        <span class="ja-word-container ${posClass}" data-word="${text}">
          <span class="furigana-line">${furigana}</span>
          <span class="spelling-line">${text}</span>
          <span class="romaji-line">${romaji}</span>
        </span>
      `;
    } else {
      annotatedSentence += `
        <span class="ja-word-container punctuation">
          <span class="furigana-line"></span>
          <span class="spelling-line">${text}</span>
          <span class="romaji-line"></span>
        </span>
      `;
    }
  });

  // Render vocabulary dictionary list
  let wordListHTML = "";
  currentWordDetailsList.forEach(detail => {
    const activeSenseIdx = wordActiveSenseMap[detail.word] || 0;
    const activeSense = detail.senses[activeSenseIdx] || { pos: "Unknown", definitions: ["No definitions"] };
    
    const definitionText = activeSense.definitions.join("; ");
    const posBadge = activeSense.pos ? `<span class="word-pos">${activeSense.pos}</span>` : "";
    const readingText = detail.reading ? `<span class="word-reading">(${detail.reading})</span>` : "";
    const posClass = getWordClass(detail.word, activeSense.pos);
    
    // Check if Jisho returned multiple meanings/senses
    const hasMultiple = detail.senses.length > 1;
    const selectorIndicator = hasMultiple 
      ? `<div class="sense-indicator" data-word="${detail.word}">⇅ Alternate meaning (${activeSenseIdx + 1} of ${detail.senses.length})</div>` 
      : "";

    wordListHTML += `
      <div class="word-item ${posClass}" data-word="${detail.word}">
        <div class="word-header">
          <div>
            <span class="word-spelling">${detail.dictionaryWord}</span>
            ${readingText}
          </div>
          ${posBadge}
        </div>
        <div class="word-definition">${definitionText}</div>
        ${selectorIndicator}
      </div>
    `;
  });

  // Toggle Romaji visibility class if settings say so
  chrome.storage.local.get(["showRomaji"], (settings) => {
    const showRomaji = settings.showRomaji !== false;
    const romajiClass = showRomaji ? "" : "hide-romaji";

    const grammarPatterns = detectGrammar(sentenceData.text || "");
    let grammarHTML = "";
    if (grammarPatterns.length > 0) {
      let itemsHTML = grammarPatterns.map(p => `
        <div class="grammar-item">
          <span class="grammar-pattern">${p.pattern}</span>
          <span class="grammar-desc">${p.desc}</span>
        </div>
      `).join("");
      grammarHTML = `
        <div class="section-title">Grammar Patterns</div>
        <div class="grammar-list">${itemsHTML}</div>
      `;
    }

    wrapper.innerHTML = `
      <div class="glass-card">
        <div class="japanese-display ${romajiClass}">${annotatedSentence}</div>
        
        <div class="grammar-legend">
          <span class="legend-item pos-noun">Noun</span>
          <span class="legend-item pos-verb">Verb</span>
          <span class="legend-item pos-particle">Particle</span>
          <span class="legend-item pos-adjective">Adjective</span>
          <span class="legend-item pos-adverb">Adverb</span>
        </div>
        
        ${currentWordDetailsList.length > 0 ? `
          <div class="section-title">Vocabulary</div>
          <div class="word-list">${wordListHTML}</div>
        ` : ""}
        
        ${grammarHTML}
        
        <div class="translation-box">
          <div class="section-title" style="color: rgba(255,255,255,0.7); margin-bottom: 2px;">Translation</div>
          <div class="translation-text">${sentenceData.translation}</div>
        </div>
      </div>
      <div class="drawer-container"></div>
    `;

    setupInteractions(wrapper);
  });
}

/**
 * Add event listeners for bidirectional hovering, tooltips, and side-popout drawer
 */
function setupInteractions(wrapper) {
  const card = wrapper.querySelector(".glass-card");
  const drawerContainer = wrapper.querySelector(".drawer-container");

  // Bidirectional highlighting: Word card hover -> text highlight
  const wordItems = card.querySelectorAll(".word-item");
  wordItems.forEach(item => {
    const wordText = item.getAttribute("data-word");
    
    item.addEventListener("mouseenter", () => {
      item.classList.add("highlighted");
      const textSpans = card.querySelectorAll(`.ja-word-container[data-word="${wordText}"]`);
      textSpans.forEach(span => span.classList.add("highlighted"));
    });

    item.addEventListener("mouseleave", () => {
      item.classList.remove("highlighted");
      const textSpans = card.querySelectorAll(`.ja-word-container[data-word="${wordText}"]`);
      textSpans.forEach(span => span.classList.remove("highlighted"));
    });

    // Click to open Alternative Meanings Drawer
    item.addEventListener("click", () => {
      const detail = currentWordDetailsList.find(d => d.word === wordText);
      if (detail && detail.senses.length > 1) {
        showSideDrawer(drawerContainer, detail);
      }
    });
  });

  // Bidirectional highlighting: Text hover -> Word card highlight
  const textSpans = card.querySelectorAll(".ja-word-container");
  textSpans.forEach(span => {
    const wordText = span.getAttribute("data-word");
    if (!wordText) return; // Skip punctuation

    span.addEventListener("mouseenter", () => {
      span.classList.add("highlighted");
      const wordCard = card.querySelector(`.word-item[data-word="${wordText}"]`);
      if (wordCard) {
        wordCard.classList.add("highlighted");
        
        // Scroll only the word-list container, not the viewport or card
        const wordList = card.querySelector(".word-list");
        if (wordList) {
          const containerTop = wordList.scrollTop;
          const containerBottom = containerTop + wordList.clientHeight;
          
          // Calculate offset relative to the scrollable container's viewport top
          const elemTop = wordCard.getBoundingClientRect().top - wordList.getBoundingClientRect().top + wordList.scrollTop;
          const elemBottom = elemTop + wordCard.offsetHeight;
          
          if (elemTop < containerTop) {
            wordList.scrollTo({ top: elemTop - 10, behavior: "smooth" });
          } else if (elemBottom > containerBottom) {
            wordList.scrollTo({ top: elemBottom - wordList.clientHeight + 10, behavior: "smooth" });
          }
        }
      }
    });

    span.addEventListener("mouseleave", () => {
      span.classList.remove("highlighted");
      const wordCard = card.querySelector(`.word-item[data-word="${wordText}"]`);
      if (wordCard) {
        wordCard.classList.remove("highlighted");
      }
    });

    span.addEventListener("click", () => {
      const detail = currentWordDetailsList.find(d => d.word === wordText);
      if (detail && detail.senses.length > 1) {
        showSideDrawer(drawerContainer, detail);
      }
    });
  });
}

/**
 * Option A: Render and handle Side-Popout Drawer
 */
function showSideDrawer(container, wordDetail) {
  const activeSenseIdx = wordActiveSenseMap[wordDetail.word] || 0;
  
  let optionsHTML = "";
  wordDetail.senses.forEach((sense, idx) => {
    const isActive = idx === activeSenseIdx ? "active" : "";
    optionsHTML += `
      <div class="sense-option ${isActive}" data-index="${idx}">
        <div class="sense-option-header">
          <span class="sense-number">Definition #${idx + 1}</span>
          <div class="sense-check"></div>
        </div>
        <div class="sense-option-pos">${sense.pos || "General"}</div>
        <div class="sense-option-definitions">${sense.definitions.join("; ")}</div>
      </div>
    `;
  });

  container.innerHTML = `
    <div class="side-drawer">
      <div class="drawer-header">
        <h4 class="drawer-title">
          <span>${wordDetail.dictionaryWord}</span>
          ${wordDetail.reading ? `<span style="font-size:12px; font-weight:400; color:var(--text-secondary)">(${wordDetail.reading})</span>` : ""}
        </h4>
        <div class="drawer-subtitle">Alternative Definitions</div>
      </div>
      <div class="word-list" style="gap:10px;">
        ${optionsHTML}
      </div>
    </div>
  `;

  // Listen to sense selections
  const options = container.querySelectorAll(".sense-option");
  options.forEach(opt => {
    opt.addEventListener("click", () => {
      const index = parseInt(opt.getAttribute("data-index"), 10);
      
      // Update state mapping
      wordActiveSenseMap[wordDetail.word] = index;
      
      // Re-update active classes in drawer UI
      options.forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      
      // Update spelling item in main glass card dynamically without full redraw
      const mainCard = hostElement.shadowRoot.querySelector(".glass-card");
      const wordCard = mainCard.querySelector(`.word-item[data-word="${wordDetail.word}"]`);
      
      if (wordCard) {
        const activeSense = wordDetail.senses[index];
        
        // Update definition text
        const defDiv = wordCard.querySelector(".word-definition");
        if (defDiv) defDiv.textContent = activeSense.definitions.join("; ");
        
        // Update POS badge
        const badgeSpan = wordCard.querySelector(".word-pos");
        if (badgeSpan) {
          if (activeSense.pos) {
            badgeSpan.textContent = activeSense.pos;
            badgeSpan.style.display = "inline-block";
          } else {
            badgeSpan.style.display = "none";
          }
        }
        
        // Update POS color classes dynamically
        const newPosClass = getWordClass(wordDetail.word, activeSense.pos);
        
        // Update original sentence word spelling color
        const textSpan = mainCard.querySelector(`.ja-word-container[data-word="${wordDetail.word}"]`);
        if (textSpan) {
          textSpan.classList.remove('pos-noun', 'pos-verb', 'pos-particle', 'pos-adjective', 'pos-adverb', 'pos-other');
          textSpan.classList.add(newPosClass);
        }
        
        // Update card POS classes
        wordCard.classList.remove('pos-noun', 'pos-verb', 'pos-particle', 'pos-adjective', 'pos-adverb', 'pos-other');
        wordCard.classList.add(newPosClass);
        
        // Update indicator label
        const indicator = wordCard.querySelector(".sense-indicator");
        if (indicator) {
          indicator.textContent = `⇅ Alternate meaning (${index + 1} of ${wordDetail.senses.length})`;
        }
      }
    });
  });
}

// ==========================================
// KANA TO ROMAJI CONVERTER & MAPPING TABLE
// ==========================================

const hiraganaToRomajiMap = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'wo', 'ん': 'n',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'だ': 'da', 'ぢ': 'dji', 'づ': 'dzu', 'で': 'de', 'ど': 'do',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  // Yoon
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
};

function katakanaToHiragana(text) {
  return text.replace(/[\u30A1-\u30F6]/g, match => {
    return String.fromCharCode(match.charCodeAt(0) - 0x60);
  });
}

function kanaToRomaji(kanaText) {
  if (!kanaText) return "";
  let text = katakanaToHiragana(kanaText);
  let romaji = "";
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (nextChar && (nextChar === 'ゃ' || nextChar === 'ゅ' || nextChar === 'ょ' || nextChar === 'ぁ' || nextChar === 'ぃ' || nextChar === 'ぅ' || nextChar === 'ぇ' || nextChar === 'ぉ')) {
      const combo = char + nextChar;
      if (hiraganaToRomajiMap[combo]) {
        romaji += hiraganaToRomajiMap[combo];
        i += 2;
        continue;
      }
    }
    
    if (char === 'っ' || char === 'ッ') {
      const nextNextChar = text[i + 1];
      if (nextNextChar) {
        const nextHira = katakanaToHiragana(nextNextChar);
        const nextRomaji = hiraganaToRomajiMap[nextHira[0]] || hiraganaToRomajiMap[nextHira];
        if (nextRomaji) {
          romaji += nextRomaji[0];
        }
      }
      i += 1;
      continue;
    }
    
    if (char === 'ー') {
      i += 1;
      continue;
    }
    
    romaji += hiraganaToRomajiMap[char] || char;
    i += 1;
  }
  
  if (romaji === 'ha' && (kanaText === 'は' || kanaText === 'ハ')) romaji = 'wa';
  if (romaji === 'he' && (kanaText === 'へ' || kanaText === 'ヘ')) romaji = 'e';
  
  return romaji;
}

function getWordClass(word, posString) {
  const particles = ['は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'の', 'か', 'ね', 'よ', 'から', 'まで', 'より', 'だけ', 'ばかり', 'ほど', 'ぐらい', 'など'];
  if (particles.includes(word)) {
    return 'pos-particle';
  }
  if (!posString) return 'pos-other';
  const pos = posString.toLowerCase();
  if (pos.includes('particle')) return 'pos-particle';
  if (pos.includes('noun')) return 'pos-noun';
  if (pos.includes('verb')) return 'pos-verb';
  if (pos.includes('adjective')) return 'pos-adjective';
  if (pos.includes('adverb') || pos.includes('conjunction')) return 'pos-adverb';
  return 'pos-other';
}

function detectGrammar(text) {
  if (!text) return [];
  const rules = [
    { pattern: '〜ている', desc: 'Present Continuous / State (-ing)', regex: /(て|で)(いる|います|いらっしゃる)/ },
    { pattern: '〜たい', desc: 'Desire / Want to do', regex: /([きしちにひみりいぎじびぴ]たい|たいです)/ },
    { pattern: '〜なければならない', desc: 'Must do / Obligation', regex: /(なければ(ならない|なりません)|ないといけない|なきゃ|なくちゃ)/ },
    { pattern: '〜ほうがいい', desc: 'Advice / Had better do', regex: /(ほう|方)が(いい|良い)/ },
    { pattern: '〜たら / 〜ば', desc: 'Conditional (If / When)', regex: /(たら|すれば|ければ|なければ|なら)/ },
    { pattern: '〜ことができる', desc: 'Ability / Can do', regex: /(こと|事)が(できる|出来)/ },
    { pattern: '〜たことがある', desc: 'Past Experience (Have done)', regex: /(た|だ)(こと|事)が(ある|あります)/ },
    { pattern: '〜ながら', desc: 'Simultaneous Action (While doing)', regex: /\w*ながら/ },
    { pattern: '〜すぎる', desc: 'Excess / Too much', regex: /すぎる|すぎます/ },
    { pattern: '〜てみる', desc: 'Try to do (to see)', regex: /(て|で)みる/ },
    { pattern: '〜ておく', desc: 'Preparation for future', regex: /(て|で)おく/ },
    { pattern: '〜だろう / 〜でしょう', desc: 'Conjecture / Probably', regex: /だろう|でしょう|かもしれない|かも/ },
    { pattern: '〜つもり', desc: 'Intention / Plan', regex: /つもり/ },
    { pattern: '〜やすい / 〜にくい', desc: 'Easy / Hard to do', regex: /やすい|にくい/ },
    { pattern: '〜んです', desc: 'Explanatory / Emphasis', regex: /(ん|の)(です|だ|なのだ)/ }
  ];
  
  return rules.filter(r => r.regex.test(text));
}
