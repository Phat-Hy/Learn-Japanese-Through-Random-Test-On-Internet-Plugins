# Learn Japanese through Context ⛩️

A premium Chrome & Opera browser extension (Manifest V3) designed to help intermediate and beginner Japanese learners read web pages. Instead of flat translations that replace original text, this extension segments sentences to render a multi-layered learning view.

---

## 🎨 Visual Layout & Design

The overlay card uses a modern, semi-transparent **glassmorphic dark-mode design** with a fixed width of `480px` to allow vocabulary columns to wrap cleanly:

*   **Aligned Word Columns (Furigana / Spelling / Romaji)**:
    *   **Furigana (Top)**: Phonetic readings (Hiragana/Katakana) are automatically placed above words that contain Kanji. Hiragana-only words are kept clean to reduce clutter.
    *   **Spelling (Middle)**: Displayed in a large, readable font size (`26px`) using the elegant *Noto Sans JP* font.
    *   **Romaji (Bottom)**: Syllable readings are mapped client-side and placed directly underneath each word in the column stack.
*   **Stationary Header & Translation**: The Japanese phrase at the top and the English translation at the bottom stay completely still.
*   **Scrollable Vocabulary List**: Only the vocabulary dictionary list scrolls internally, preventing the extension card or webpage window from shifting out of view when you hover over words.

---

## 🚀 Key Features

1.  **Dual Trigger Modes**:
    *   *Click to Translate*: Highlight Japanese text to show a floating crimson logo icon; click it to open the analysis.
    *   *Auto-Translate on Selection*: Instantly opens the overlay card when text is selected.
2.  **Sentence + Word Breakdown**: Combines Google Translate (for sentence-level context and translation) with Jisho.org (for detailed dictionary definitions and readings).
3.  **Automatic Name & Proper Noun Fallback**: If Jisho.org has no dictionary entries for proper nouns, fictional character names (e.g. `ダークドレアム`), or slang, the extension automatically queries Google Translate for that single term to fetch the correct translation.
4.  **Interactive Definition Overrides (Option A: Side Drawer)**: If a word has multiple meanings, clicking on it slides open a sleek drawer on the side of the card, allowing you to select and override the active definition.
5.  **Offline Database Cache**: Jisho definitions are cached in `chrome.storage.local` to speed up subsequent queries. Failed or "No translation found" queries are automatically filtered out of the cache, and old failed entries are cleaned up on startup.
6.  **Paste Lookup Popup**: Open the extension icon in your toolbar to paste any Japanese text for manual lookup. The popup expands its width dynamically to `780px` when the side drawer is open.
7.  **Isolated CSS (Shadow DOM)**: The content script uses a Shadow DOM to inject the overlay, keeping its styling completely unaffected by the stylesheet rules of the webpage you are browsing.

---

## ⚙️ Installation (Chrome / Opera)

Since the extension runs locally as a developer extension, you can install it using these simple steps:

1.  **Download/Clone** this repository to a folder on your computer.
2.  Open your browser and navigate to the Extensions page:
    *   *Chrome*: `chrome://extensions`
    *   *Opera*: `opera://extensions`
3.  In the top-right corner, toggle **Developer mode** to **ON**.
4.  Click the **Load unpacked** button in the top-left corner.
5.  Select the folder containing this project (the one that contains `manifest.json`).
6.  Pin the extension icon (crimson sun and study Kanji `学`) to your toolbar!

---

## 📖 Usage

### Webpage Hover
1.  Navigate to any Japanese webpage (e.g., [ja.wikipedia.org](https://ja.wikipedia.org)).
2.  Select a Japanese sentence.
3.  Click the floating red circular icon (or let it auto-trigger based on your settings).
4.  Hover over the words in the original sentence at the top to highlight their respective vocabulary cards in the list below.
5.  Hover over cards in the vocabulary list to highlight the word in the original sentence.
6.  Click on any card with multiple meanings to open the side drawer and select an alternate definition.
7.  Click anywhere outside the card to close it.

### Manual Input
1.  Click the extension icon in your browser toolbar.
2.  Paste any Japanese text into the textarea.
3.  Click **Analyze Text** (or press `Ctrl + Enter`).
4.  Click **← Analyze another text** in the card to go back.
