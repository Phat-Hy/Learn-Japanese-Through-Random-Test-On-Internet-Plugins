// test_runner.js
// Automated architectural test suite for Learn Japanese Through Random Phrase on Internet extension parsing engine.

const PARTICLES = ['は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'の', 'か', 'ね', 'よ', 'から', 'まで', 'より', 'だけ', 'ばかり', 'ほど', 'ぐらい', 'など', 'て', 'た', 'だ', 'です', 'である', 'にぇ', 'ね', 'よ', 'な', 'わ', 'ぞ', 'ぜ', 'なら'];

function isJapanese(text) {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

function preprocessRawSegments(rawSegments) {
  let processed = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    if (seg.isWordLike && (seg.segment === 'なお' || seg.segment === 'なご')) {
      if (i + 1 < rawSegments.length && rawSegments[i + 1].isWordLike && /[\u4E00-\u9FAF]/.test(rawSegments[i + 1].segment)) {
        const prefix = seg.segment[0];
        const suffix = seg.segment[1];
        processed.push({ ...seg, segment: prefix }, { ...seg, segment: suffix });
        continue;
      }
    }
    processed.push(seg);
  }
  return processed;
}

function mergeSegments(rawSegments, blacklist = []) {
  let merged = [];
  let i = 0;
  
  // Cache for particle lookup to avoid repeated array searches if needed, 
  // though PARTICLES is assumed global or imported.
  const PARTICLES = new Set(['の', 'が', 'を', 'は', 'と', 'で', 'に', 'も', 'や', 'ね', 'よ', 'か', 'だ', 'け', 'て', 'れ', 'り', 'る', 'た', 'だ', 'ます', 'ましょう', 'よう', 'て', 'で']);

  while (i < rawSegments.length) {
    let currentSeg = { ...rawSegments[i] };
    let currentText = currentSeg.segment;
    
    // Skip particles and non-word-like segments for merging logic, but keep them in output if they start a new segment
    if (!currentSeg.isWordLike || PARTICLES.has(currentText)) {
      merged.push(currentSeg);
      i++;
      continue;
    }

    while (i + 1 < rawSegments.length) {
      const nextSeg = rawSegments[i + 1];
      const nextText = nextSeg.segment;
      
      // Only merge if both are word-like
      if (!nextSeg.isWordLike) break;

      let shouldMerge = false;
      const potentialMerge = currentText + nextText;
      
      // Check blacklist first
      if (blacklist.includes(potentialMerge)) {
        shouldMerge = false;
      } else {
        // 1. Conjugation endings (te, de, ta, da, masu, etc.) - expanded list including specific splits like 'れ' + 'ま' + 'せ'
        const conjugationEndings = ['て', 'で', 'た', 'だ', 'ます', 'ました', 'ませ', 'ん', 'よう', 'ましょう', 'たら', 'だら', 'ば', 'すれば', 'ければ', 'る', 'れ', 'り'];
        
        // Handle specific verb stem + ending splits (e.g., 眠れ + ま + せ -> 眠れません)
        if (conjugationEndings.includes(nextText)) {
          shouldMerge = true;
        } 
        // 2. Honorifics: お/ご/御 + Kanji
        else if ((currentText === 'お' || currentText === 'ご' || currentText === '御') && /[\u4E00-\u9FAF]/.test(nextText)) {
          shouldMerge = true;
        } 
        // 3. Kanji + Kanji compounds
        else if (/[\u4E00-\u9FAF]/.test(currentText) && /[\u4E00-\u9FAF]/.test(nextText)) {
          shouldMerge = true;
        } 
        // 4. Kanji + Hiragana (excluding particles and specific split conjugations like 'れ'+'ま')
        else if (/[\u4E00-\u9FAF]/.test(currentText) && /[\u3040-\u309F]/.test(nextText)) {
          // Exclude common particle suffixes that shouldn't merge with Kanji stems in this context unless they are part of a compound
          if (!PARTICLES.has(nextText)) {
            shouldMerge = true;
          }
        } 
        // 5. Katakana + Katakana compounds
        else if (/[\u30A0-\u30FF]/.test(currentText) && /[\u30A0-\u30FF]/.test(nextText)) {
          shouldMerge = true;
        } 
        // 6. Latin + suru variants (shi, suru, shite, shita, shimasu)
        else if (/[a-zA-Z]/.test(currentText) && (nextText === 'し' || nextText === 'する' || nextText === 'して' || nextText === 'した' || nextText === 'します')) {
          shouldMerge = true;
        } 
        // 7. Slang/Colloquial endings: "だにぇ", "にぇ" (often attached to previous word)
        else if (/[a-zA-Z]/.test(nextText)) { 
           const slangEndings = ['にぇ', 'だにぇ', 'よ', 'ぜ']; 
           if (slangEndings.includes(nextText) || nextText === 'え') {
             shouldMerge = true;
           }
        }
        
        // 8. Specific verb stem + hiragana split fixes (e.g., 眠れ + ま -> 眠れる, or 寝ても -> 寝て + も where 'も' is a particle but here it's part of the phrase structure)
        // This specifically targets cases like "眠れません" being split as "眠", "れ", "ま", "せん". 
        // If current ends in 'れ', 'り', or 'る' and next starts with hiragana that looks like a stem continuation (like ま, せ), merge.
        else if (/[\u3040-\u309F\u30FC]+$/.test(currentText) && /[\u3040-\u309F]/.test(nextText)) {
           // Check if current ends with a verb ending and next is a stem-like hiragana (e.g., ま from ます, せ from せん)
           const currentEnds = currentText.slice(-1);
           const commonStems = ['ま', 'せ', 'る', 'れ', 'り']; // Common stems following verb endings in LLM splits
           if (commonStems.includes(nextText)) {
             shouldMerge = true;
           }
        }
      }

      if (shouldMerge) {
        currentText += nextText;
        i++;
      } else {
        break;
      }
    }
    
    merged.push({ ...currentSeg, segment: currentText });
    i++;
  }
  return merged;
}

function isExactMatch(word, detail) {
  if (!detail || detail.isFallback) return false;
  const dictWord = detail.dictionaryWord;
  
  // Exact match on dictionary word or reading
  if (dictWord === word || detail.reading === word) return true;

  // Check for common suffixes (san, tachi, etc.)
  const suffixes = ['様', 'さま', 'ちゃん', 'くん', 'さん', 'たち', '達'];
  for (const s of suffixes) {
    if (word.endsWith(s) && word.startsWith(dictWord)) return true;
  }

  // Handle verbs/adjectives with conjugation endings or specific stems
  if (dictWord && dictWord.length > 1) {
    const endsInKanji = /[\u4E00-\u9FAF]/.test(dictWord[dictWord.length - 1]);
    
    // If the dictionary word ends in Kanji, strip it to get the stem for comparison
    let stem;
    if (endsInKanji) {
      stem = dictWord.slice(0, -1);
    } else {
      stem = dictWord;
    }

    if (word.startsWith(stem)) {
      const pos = detail.senses && detail.senses[0] ? detail.senses[0].pos.toLowerCase() : '';
      
      // Check if the position is verb or adjective to allow conjugation matching
      if (pos.includes('verb') || pos.includes('adjective')) {
        const suffix = word.slice(stem.length);
        
        // Match pure Hiragana endings (conjugations) - includes specific splits like 'れ'+'ま'+'せ'
        if (/^[\u3040-\u309F\u30FC]+$/.test(suffix)) return true;
        
        // Explicitly match common conjugation patterns that might be split incorrectly
        const verbEndings = ['る', 'れ', 'り', 'た', 'だ', 'ます', 'ましょう', 'よう', 'て', 'で'];
        if (verbEndings.includes(suffix)) return true;
        
        // Match specific compound-like endings often seen in LLM outputs vs raw segments
        const specialEndings = ['から', 'ので', 'のに', 'ながら', 'ように'];
        if (specialEndings.includes(suffix)) return true;
        
        // NEW: Handle specific verb stem + hiragana split fixes (e.g., 眠れ + ま -> 眠れる)
        // If the word starts with a known verb stem and the suffix is a common hiragana continuation of that stem
        const commonStems = ['ま', 'せ', 'る', 'れ', 'り']; 
        if (commonStems.includes(suffix)) return true;
      }
    }
  }

  // Fallback: Check if word matches any known conjugation pattern even without strict stem logic for very short words
  const verbEndings = ['る', 'れ', 'り', 'た', 'だ', 'ます', 'ましょう', 'よう', 'て', 'で'];
  if (verbEndings.some(end => word.endsWith(end))) return true;

  return false;
}

async function jishoLookup(word) {
  const url = 'https://jisho.org/api/v1/search/words?keyword=' + encodeURIComponent(word);
  const res = await fetch(url);
  if (!res.ok) throw new Error();
  const json = await res.json();
  if (json.data && json.data.length > 0) {
    const entry = json.data[0];
    return {
      word: word,
      dictionaryWord: entry.japanese[0].word || word,
      reading: entry.japanese[0].reading || '',
      senses: entry.senses.map(s => ({
        pos: s.parts_of_speech ? s.parts_of_speech.join(', ') : '',
        definitions: s.english_definitions || []
      })).filter(s => s.definitions.length > 0)
    };
  }
  return {
    word: word,
    dictionaryWord: word,
    reading: word,
    isFallback: true,
    senses: [{ pos: 'Unknown', definitions: ['No translation found'] }]
  };
}

async function analyzeSentenceFlow(text) {
  const segmenter = new Intl.Segmenter('ja-JP', { granularity: 'word' });
  let rawSegments = Array.from(segmenter.segment(text));
  rawSegments = preprocessRawSegments(rawSegments);
  
  let blacklist = [];
  let segments = [];
  let wordResults = {};
  let passes = 0;
  
  while (passes < 5) {
    segments = mergeSegments(rawSegments, blacklist);
    const uniqueWords = [...new Set(
      segments
        .filter(s => s.isWordLike && isJapanese(s.segment))
        .map(s => s.segment)
        .filter(w => {
          if (PARTICLES.includes(w)) return false;
          if (['です', 'だ', 'である', 'でした', 'だった'].includes(w)) return false;
          if (w.length === 1 && /^[\u3040-\u309F\u30A0-\u30FF]$/.test(w)) return false;
          return true;
        })
    )];
    
    const wordsToQuery = uniqueWords.filter(w => !wordResults[w]);
    if (wordsToQuery.length > 0) {
      // sequential lookup to avoid Jisho API bursts
      for (const w of wordsToQuery) {
        try {
          wordResults[w] = await jishoLookup(w);
        } catch (e) {
          wordResults[w] = null;
        }
      }
    }
    
    let newBlacklistAdded = false;
    uniqueWords.forEach(word => {
      const detail = wordResults[word];
      if (word.length > 1 && !isExactMatch(word, detail) && !blacklist.includes(word)) {
        blacklist.push(word);
        newBlacklistAdded = true;
      }
    });
    
    if (!newBlacklistAdded) break;
    passes++;
  }
  
  return { segments, wordResults };
}

const testSentences = [
  { name: '1. Te-form Verb & okurigana', text: 'もかと夏祭りにむけて、出し物つくる' },
  { name: '2. Latin & Slang merging', text: '鷹嶺ルイ、レースの賞金で馬をGETします。沢山。' },
  { name: '3. Katakana compound nouns', text: '深夜チルファーム' },
  { name: '4. Copula / particle splits', text: '視聴者参加型だにぇ' },
  { name: '5. Particle separations', text: 'お姉さんによる、オトナのためのディープな朝活配信ならココ！' },
  { name: '6. Passive Verb stems', text: '僕っ子人外娘の触手耳かきで洗脳されて、卵を植えつけられる……' },
  { name: '7. Honorific suffixes', text: '勇者様' },
  { name: '8. Verb relative clauses', text: '下げる呪い' },
  { name: '9. Na-adjective exact matching', text: '無様' },
  { name: '10. Short Kanji compounds', text: '女子鬼' },
  { name: '11. Long compound chains', text: '添い寝喫茶で『サキュバス耳かきねんね』をお願いしたら、真面目そうなお姉さんが頑張ってくれた' },
  { name: '12. High complexity slangs', text: '上位存在様のくちゅトロ♡触手耳かきで、オノマトペをやっぷり囁かれながら「管理」されちゃう。' },
  { name: '13. Unrecognized suffix compounds', text: 'お姉さん家' }
];

async function runAllTests() {
  console.log('============================================================');
  console.log('RUNNING SYSTEMATIC ARCHITECTURE TESTS');
  console.log('============================================================\n');
  
  for (const t of testSentences) {
    console.log(`[TEST] ${t.name}`);
    console.log(`Input: "${t.text}"`);
    
    try {
      const { segments, wordResults } = await analyzeSentenceFlow(t.text);
      const outputWords = segments.map(s => s.segment);
      console.log(`Segments: [ ${outputWords.map(w => `'${w}'`).join(', ')} ]`);
      
      const missingTranslations = [];
      segments.forEach(s => {
        if (s.isWordLike && isJapanese(s.segment)) {
          const res = wordResults[s.segment];
          if (res && res.isFallback) {
            missingTranslations.push(s.segment);
          }
        }
      });
      
      if (missingTranslations.length > 0) {
        console.log(`⚠️ Unresolved Fallbacks: ${JSON.stringify(missingTranslations)}`);
      } else {
        console.log('✅ All word-like segments mapped to dictionary entries!');
      }
    } catch (e) {
      console.error(`❌ Test failed with error:`, e.message);
    }
    console.log('------------------------------------------------------------\n');
  }
}

async function runCommandLine() {
  const customSentence = process.argv[2];
  if (customSentence) {
    const result = await analyzeSentenceFlow(customSentence);
    console.log(JSON.stringify(result, null, 2));
  } else {
    await runAllTests();
  }
}

runCommandLine().catch(console.error);
