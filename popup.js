// popup.js

let wordActiveSenseMap = {};
let currentWordDetailsList = [];

// DOM Elements
const inputContainer = document.getElementById("input-container");
const analysisContainer = document.getElementById("analysis-container");
const cardHolder = document.getElementById("card-holder");
const popupDrawer = document.getElementById("popup-drawer");
const jpInput = document.getElementById("japanese-input");
const analyzeBtn = document.getElementById("analyze-button");
const openSettingsBtn = document.getElementById("open-settings");

// Open Options Page handler
openSettingsBtn.addEventListener("click", () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options.html"));
  }
});

// Analyze Button Click
analyzeBtn.addEventListener("click", performAnalysis);

// Also support Ctrl+Enter to trigger analysis
jpInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    performAnalysis();
  }
});

/**
 * Executes text analysis inside the popup
 */
async function performAnalysis() {
  const text = jpInput.value.trim();
  if (!text) return;

  analyzeBtn.disabled = true;
  const originalBtnText = analyzeBtn.innerHTML;
  analyzeBtn.innerHTML = "<span>Analyzing...</span>";

  try {
    // 1. Get Translation & Romaji
    const sentenceResult = await sendMessageAsync({ action: "analyze-sentence", text });
    
    // 2. Segment
    const segmenter = new Intl.Segmenter("ja-JP", { granularity: "word" });
    const segments = Array.from(segmenter.segment(text));
    
    // Query Jisho for Japanese words
    const wordsToQuery = segments
      .filter(s => s.isWordLike && isJapanese(s.segment))
      .map(s => s.segment);
    const uniqueWords = [...new Set(wordsToQuery)];
    
    const wordPromises = uniqueWords.map(word => 
      sendMessageAsync({ action: "jisho-lookup", word })
        .then(res => res.success ? res.data : null)
        .catch(() => null)
    );
    
    const wordResults = await Promise.all(wordPromises);
    currentWordDetailsList = wordResults.filter(Boolean);

    // Reset sense mapping
    wordActiveSenseMap = {};
    currentWordDetailsList.forEach(detail => {
      wordActiveSenseMap[detail.word] = 0;
    });

    // 3. Render Card
    renderPopupCard(segments, sentenceResult.data);
    
    // Toggle view visibility
    inputContainer.style.display = "none";
    analysisContainer.style.display = "flex";
  } catch (error) {
    console.error("Analysis failed:", error);
    alert("Analysis failed. Please check internet connection.");
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = originalBtnText;
  }
}

/**
 * Checks if a string contains Japanese characters
 */
function isJapanese(text) {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

/**
 * Helper to communicate with background
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
 * Renders the analysis breakdown layout
 */
/**
 * Renders the analysis breakdown layout
 */
function renderPopupCard(segments, sentenceData) {
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

  chrome.storage.local.get(["showRomaji"], (settings) => {
    const showRomaji = settings.showRomaji !== false;
    const romajiClass = showRomaji ? "" : "hide-romaji";

    cardHolder.innerHTML = `
      <div class="glass-card">
        <!-- Back navigation in popup -->
        <a id="back-to-input" style="color:var(--text-secondary); text-decoration:none; font-size:12px; margin-bottom:8px; display:inline-block; cursor:pointer;">← Analyze another text</a>
        
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
        
        <div class="translation-box">
          <div class="section-title" style="color: rgba(255,255,255,0.7); margin-bottom: 2px;">Translation</div>
          <div class="translation-text">${sentenceData.translation}</div>
        </div>
      </div>
    `;

    // Back to input click handler
    cardHolder.querySelector("#back-to-input").addEventListener("click", () => {
      document.body.classList.remove("expanded");
      popupDrawer.classList.remove("visible");
      analysisContainer.style.display = "none";
      inputContainer.style.display = "flex";
    });

    setupPopupInteractions();
  });
}

/**
 * Configure hover highlighting and drawer expand behaviors inside the popup
 */
function setupPopupInteractions() {
  const card = cardHolder.querySelector(".glass-card");

  // Word cards hover -> text highlight
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
        showPopupDrawer(detail);
      }
    });
  });

  // Text hover -> Word card highlight
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
        showPopupDrawer(detail);
      }
    });
  });
}

/**
 * Expand popup and display alternate senses side drawer
 */
function showPopupDrawer(wordDetail) {
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

  popupDrawer.innerHTML = `
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
  `;

  // Expand popup width and show drawer
  document.body.classList.add("expanded");
  popupDrawer.classList.add("visible");

  // Listen to selections
  const options = popupDrawer.querySelectorAll(".sense-option");
  options.forEach(opt => {
    opt.addEventListener("click", () => {
      const index = parseInt(opt.getAttribute("data-index"), 10);
      
      wordActiveSenseMap[wordDetail.word] = index;
      options.forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      
      const wordCard = cardHolder.querySelector(`.word-item[data-word="${wordDetail.word}"]`);
      if (wordCard) {
        const activeSense = wordDetail.senses[index];
        
        const defDiv = wordCard.querySelector(".word-definition");
        if (defDiv) defDiv.textContent = activeSense.definitions.join("; ");
        
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
        const textSpan = cardHolder.querySelector(`.ja-word-container[data-word="${wordDetail.word}"]`);
        if (textSpan) {
          textSpan.classList.remove('pos-noun', 'pos-verb', 'pos-particle', 'pos-adjective', 'pos-adverb', 'pos-other');
          textSpan.classList.add(newPosClass);
        }
        
        // Update card POS classes
        wordCard.classList.remove('pos-noun', 'pos-verb', 'pos-particle', 'pos-adjective', 'pos-adverb', 'pos-other');
        wordCard.classList.add(newPosClass);
        
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
