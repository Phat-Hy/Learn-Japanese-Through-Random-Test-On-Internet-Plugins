# Plan: Japanese Reading & Translation Browser Extension

**Status:** approved

**Baseline:** No existing codebase. All components will be built from scratch.

## Task 1: Extension Manifest and Core Files
- Spec: Requirements 1, 5
- Files:
  - `manifest.json`
  - `background.js`
  - `icons/icon128.png` (and other sizes)
- Do:
  - Create standard Chrome Extension Manifest V3.
  - Declare permissions: `storage`, `activeTab`, `host_permissions` for Google Translate and Jisho APIs.
  - Implement canvas-based icon generator script or generate placeholder icons.
- Verify: Extension can be loaded into Chrome (`chrome://extensions`) without errors.

## Task 2: Background Service Worker (API Bridge & Caching)
- Spec: Requirement 2
- Files:
  - `background.js`
- Do:
  - Listen for runtime messages (`analyze-text` and `jisho-search`).
  - Implement Google Translate fetching (`dt=t` & `dt=rm` for translation and romaji transliteration).
  - Implement Jisho.org API fetching and caching in `chrome.storage.local`.
- Verify: Send test messages from background console and inspect network requests and storage cache.

## Task 3: Content Script - Text Selection & Floating Trigger
- Spec: Requirements 1, 3
- Files:
  - `content.js`
  - `content.css`
- Do:
  - Listen for selection events. Filter for selections containing Japanese characters (Kanji, Hiragana, Katakana range).
  - Inject a floating button near the text selection coordinates.
  - Dismiss the floating button on selection clear or click away.
- Verify: Selecting Japanese text on a webpage shows a clean, nicely positioned floating icon.

## Task 4: Content Script - Detailed Overlay Card (Shadow DOM)
- Spec: Requirements 3, 5
- Files:
  - `content.js`
  - `content.css`
- Do:
  - When the floating button is clicked, fetch the analysis from `background.js`.
  - segment Japanese text using `Intl.Segmenter`.
  - Create a Shadow DOM container on the page to prevent host CSS contamination.
  - Render the annotated text using `<ruby>` tags for kanji + hiragana furigana.
  - Render Romaji transliteration, word dictionary definitions, and full sentence translation.
  - Apply custom glassmorphic styling (dark/light theme compatible, smooth transitions).
- Verify: Clicking the floating button renders the full card with furigana, romaji, word dictionary, and sentence translation.

## Task 5: Interactive Word Meanings & Custom Alignment
- Spec: Requirement 4
- Files:
  - `content.js`
- Do:
  - Align kanji sub-strings with hiragana readings for `<ruby>` tagging (comparing character sequences).
  - Render an interactive dropdown next to each word card in the dictionary list showing alternate senses.
  - Allow selecting a sense to update the word's active definition.
  - Highlight corresponding `<ruby>` word on card hover.
- Verify: Hovering/clicking a word opens the sense dropdown, and selecting an alternate sense changes the active displayed definition.

## Task 6: Popup and Options Pages
- Spec: Requirements 1, 3, 5
- Files:
  - `popup.html`, `popup.js`, `popup.css`
  - `options.html`, `options.js`, `options.css`
- Do:
  - Build the Popup UI with a text area and analysis button. Reuse the segmented analysis rendering logic.
  - Build the Options UI for toggling Romaji, auto-translate, and clearing the local cache.
- Verify: Opening the popup allows pasting Japanese text and renders the card. Options successfully modify storage values and affect analysis behavior.
