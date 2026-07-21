# Spec: Japanese Reading & Translation Browser Extension

**Status:** approved

## Goal
Build a Chrome Extension (Manifest V3) that helps users learn Japanese while browsing the web. Instead of replacing text with a flat English translation, it parses selected text to render a detailed layout: furigana above kanji words, romaji/reading of the sentence below, individual word dictionary definitions, and the full translation, allowing users to hover and override word meanings.

## Requirements

### 1. Extension Manifest & Architecture
- MUST use Chrome Extension **Manifest V3**.
- MUST consist of:
  - A **Background Service Worker** (`background.js`) to handle cross-origin API requests to Google Translate and Jisho.org, avoiding CORS blocks.
  - A **Content Script** (`content.js` and CSS) injected into webpages to monitor text selection and show a rich tooltip.
  - A **Popup Page** (`popup.html`, `popup.js`, `popup.css`) providing a direct text input interface for instant lookup.
  - An **Options Page** (`options.html`, `options.js`) to configure user preferences (e.g., show/hide Romaji, auto-trigger on selection).

### 2. Sentence Segmentation & Translation Flow
- WHEN a user selects Japanese text (or inputs it in the popup) and requests analysis:
  - The system MUST split the Japanese text into words using the native `Intl.Segmenter` API (`locale: 'ja-JP'`, `granularity: 'word'`).
  - The system MUST fetch the sentence translation and romaji transliteration using the free Google Translate API endpoint:
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&dt=rm&q=<text>`
  - The system MUST fetch the reading (furigana) and dictionary definitions for each segmented word containing kanji/words (using `isWordLike`) by querying Jisho.org's API:
    `https://jisho.org/api/v1/search/words?keyword=<word>`
  - The system MUST cache Jisho lookup results in `chrome.storage.local` to minimize network requests, improve speed, and prevent rate-limiting.

### 3. Rich Annotation Layout (UI/UX)
- The overlay/popup UI MUST display the following vertical components:
  1. **Annotated Original Text (Top)**: Render the Japanese text. Words with kanji must be wrapped in HTML `<ruby>` tags, showing their hiragana reading above them.
  2. **Romaji/Sentence Reading (Middle)**: The sentence-level pronunciation transliteration returned by Google Translate.
  3. **English Word Meanings (Middle-Low)**: A list of the segmented words, showing their dictionary form, part of speech, and the selected English meaning.
  4. **Full Translation (Bottom)**: The full English translation of the sentence.
- Hovering over a word in the **Annotated Original Text** MUST highlight that word's definition card in the word meanings list.

### 4. Interactive Meanings (User Intervention)
- WHEN a user hovers over a word in the meaning list (or clicks it), if Jisho returned multiple senses/meanings for that word:
  - The UI MUST display a dropdown or list next to the word showing all alternate meanings.
  - WHEN the user selects an alternate meaning, the UI MUST update the active meaning for that word in the translation view.
  - The first/best-matched sense returned by Jisho should be pre-selected by default.

### 5. Visual Design (Aesthetics)
- MUST use a premium, modern design with custom fonts, glassmorphic styles, smooth transitions, and distinct typography (e.g., Outfit/Inter, rounded card container, custom scrollbars, cohesive dark/light mode palette).
- The overlay injected into webpages must escape the host page's CSS (using a Shadow DOM) so that the styles remain consistent and do not clash with the host page.

## Out of Scope
- Support for offline dictionary files (Yomichan-style SQLite/ZIP importing) for the initial version. All data will be retrieved via API and cached.
- Deep grammar parsing (e.g., identifying complex nested clauses, verb conjugations back to dictionary form manually beyond what Jisho returns).
- Translation to languages other than English for the word dictionary (sentence translation can support other languages, but dictionary definitions are limited to Jisho's English database).

## Acceptance Criteria
- [ ] Extension successfully installs as a Manifest V3 developer extension in Chrome.
- [ ] Selecting Japanese text on a webpage shows a floating trigger icon, which opens the detailed overlay card when clicked.
- [ ] The overlay card shows:
  - Original text with furigana correctly aligned above the kanji.
  - Sentence-level romaji transcription.
  - Individual word breakdown with definitions.
  - Full sentence English translation.
- [ ] Hovering/clicking a word opens a meaning picker list if multiple definitions exist, allowing the user to select an alternate meaning.
- [ ] Jisho API responses are cached in `chrome.storage.local` and can be retrieved instantly on repeat selections.
- [ ] Popup UI functions identically to the content script overlay, accepting manual text inputs.
- [ ] Styling of the floating overlay card remains completely unaffected by the host webpage's CSS (using Shadow DOM).
