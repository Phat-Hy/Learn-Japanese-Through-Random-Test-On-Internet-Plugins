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
  while (i < rawSegments.length) {
    let currentSeg = { ...rawSegments[i] };
    let currentText = currentSeg.segment;
    if (currentSeg.isWordLike && !PARTICLES.includes(currentText)) {
      while (i + 1 < rawSegments.length) {
        const nextSeg = rawSegments[i + 1];
        const nextText = nextSeg.segment;
        if (!nextSeg.isWordLike) break;
        const conjugationEndings = ['て', 'で', 'た', 'だ', 'ます', 'ました', 'ませ', 'ん', 'よう', 'ましょう', 'たら', 'だら', 'ば', 'すれば', 'ければ'];
        const isConjugation = conjugationEndings.includes(nextText);
        const currentHasKanji = /[\u4E00-\u9FAF]/.test(currentText);
        const currentHasKatakana = /[\u30A0-\u30FF]/.test(currentText);
        const currentHasLatin = /[a-zA-Z]/.test(currentText);
        const nextHasKanji = /[\u4E00-\u9FAF]/.test(nextText);
        const nextHasKatakana = /[\u30A0-\u30FF]/.test(nextText);
        const nextHasHiragana = /[\u3040-\u309F]/.test(nextText);
        let shouldMerge = false;
        const potentialMerge = currentText + nextText;
        if (blacklist.includes(potentialMerge)) {
          shouldMerge = false;
        } else if (isConjugation) {
          shouldMerge = true;
        } else if ((currentText === 'お' || currentText === 'ご' || currentText === '御') && nextHasKanji) {
          shouldMerge = true;
        } else if (currentHasKanji && nextHasKanji) {
          shouldMerge = true;
        } else if (currentHasKanji && nextHasHiragana && !PARTICLES.includes(nextText)) {
          shouldMerge = true;
        } else if (currentHasKatakana && nextHasKatakana) {
          shouldMerge = true;
        } else if (currentHasLatin && (nextText === 'し' || nextText === 'する' || nextText === 'して' || nextText === 'した' || nextText === 'します')) {
          shouldMerge = true;
        }
        if (shouldMerge) {
          currentText += nextText;
          i++;
        } else {
          break;
        }
      }
      currentSeg.segment = currentText;
    }
    merged.push(currentSeg);
    i++;
  }
  return merged;
}

function isExactMatch(word, detail) {
  if (!detail || detail.isFallback) return false;
  const dictWord = detail.dictionaryWord;
  if (dictWord === word || detail.reading === word) return true;
  const suffixes = ['様', 'さま', 'ちゃん', 'くん', 'さん', 'たち', '達'];
  for (const s of suffixes) {
    if (word.endsWith(s) && word.startsWith(dictWord)) return true;
  }
  if (dictWord && dictWord.length > 1) {
    const endsInKanji = /[\u4E00-\u9FAF]/.test(dictWord[dictWord.length - 1]);
    const stem = endsInKanji ? dictWord : dictWord.slice(0, -1);
    if (word.startsWith(stem)) {
      const pos = detail.senses && detail.senses[0] ? detail.senses[0].pos.toLowerCase() : '';
      if (pos.includes('verb') || pos.includes('adjective')) {
        const suffix = word.slice(stem.length);
        if (!suffix || /^[\u3040-\u309F\u30FC]+$/.test(suffix)) return true;
      }
    }
  }
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

runAllTests().catch(console.error);
