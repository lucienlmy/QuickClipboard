import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { toast } from '@shared/store/toastStore';
import { restoreLastFocus } from '@shared/api/window';
import { Virtuoso } from 'react-virtuoso';
import { useInputFocus } from '@shared/hooks/useInputFocus';
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar';
import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';
import emojiDataEn from 'emoji-picker-element-data/en/cldr/data.json';
import emojiDataCn from 'emoji-picker-element-data/zh/cldr/data.json';

const GROUP_ID_MAP = {
  0: 'smileys-emotion',
  1: 'people-body',
  3: 'animals-nature',
  4: 'food-drink',
  5: 'travel-places',
  6: 'activities',
  7: 'objects',
  8: 'symbols'
};

const SYMBOL_RANGES = {
  punctuation: [[0x3000, 0x303F], [0xFF01, 0xFF5E]],
  arrows:     [[0x2190, 0x21FF], [0x27F0, 0x27FF], [0x2900, 0x297F]],
  math:       [[0x2200, 0x22FF], [0x27C0, 0x27EF], [0x2980, 0x29FF]],
  currency:   [[0x20A0, 0x20CF]],
  geometric:  [[0x25A0, 0x25FF]],
  box:        [[0x2500, 0x257F]],
  misc:       [[0x2600, 0x26FF], [0x2700, 0x27BF]],
  technical:  [[0x2300, 0x23FF]],
  letterlike: [[0x2100, 0x214F]],
  numbers:    [[0x2460, 0x24FF]],
};

const PUNCTUATION_MANUAL = [
  '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  ':', ';', '<', '=', '>', '?', '@', '[', '\\', ']', '^', '_', '`', '{', '|', '}', '~',
  '‘', '’', '“', '”', '…', '—', '–', '·', '•', '©', '®', '™', '°', '±', '×', '÷',
];

function scanRanges(ranges) {
  const arr = [];
  for (const [start, end] of ranges) {
    for (let cp = start; cp <= end; cp++) {
      try {
        const ch = String.fromCodePoint(cp);
        if (!/\s/.test(ch) && ch.trim()) arr.push(ch);
      } catch (e) {}
    }
  }
  return arr;
}

const symbolCategories = {};
for (const name in SYMBOL_RANGES) {
  symbolCategories[name] = scanRanges(SYMBOL_RANGES[name]);
}
symbolCategories['punctuation'] = [...PUNCTUATION_MANUAL, ...symbolCategories['punctuation']];

// 符号分类配置
const SYMBOL_CATS = [
  { id: 'punctuation', icon: 'ti-quote', labelKey: 'emoji.cat.punctuation' },
  { id: 'arrows', icon: 'ti-arrow-right', labelKey: 'emoji.cat.arrows' },
  { id: 'math', icon: 'ti-math', labelKey: 'emoji.cat.math' },
  { id: 'currency', icon: 'ti-currency-dollar', labelKey: 'emoji.cat.currency' },
  { id: 'geometric', icon: 'ti-shape', labelKey: 'emoji.cat.geometric' },
  { id: 'box', icon: 'ti-box', labelKey: 'emoji.cat.box' },
  { id: 'misc', icon: 'ti-star', labelKey: 'emoji.cat.misc' },
  { id: 'technical', icon: 'ti-settings', labelKey: 'emoji.cat.technical' },
  { id: 'letterlike', icon: 'ti-letter-a', labelKey: 'emoji.cat.letterlike' },
  { id: 'numbers', icon: 'ti-number', labelKey: 'emoji.cat.numbers' },
];

// Emoji 分类配置
const EMOJI_CATS = [
  { id: 'recent', icon: 'ti-clock', labelKey: 'emoji.recent' },
  { id: 'smileys-emotion', icon: 'ti-mood-smile', labelKey: 'emoji.smileys' },
  { id: 'people-body', icon: 'ti-user', labelKey: 'emoji.people' },
  { id: 'animals-nature', icon: 'ti-paw', labelKey: 'emoji.animals' },
  { id: 'food-drink', icon: 'ti-apple', labelKey: 'emoji.food' },
  { id: 'travel-places', icon: 'ti-plane', labelKey: 'emoji.travel' },
  { id: 'activities', icon: 'ti-ball-football', labelKey: 'emoji.activities' },
  { id: 'objects', icon: 'ti-bulb', labelKey: 'emoji.objects' },
  { id: 'symbols', icon: 'ti-heart', labelKey: 'emoji.symbolsCat' },
];

const RECENT_KEY = 'emoji_recent_v1';
const SKIN_TONE_KEY = 'emoji_skin_tone';
const MAX_RECENT = 32;

const SKIN_TONES = [
  { id: 'default', label: 'Default' },
  { id: 'light', label: 'Light' },
  { id: 'medium-light', label: 'Medium-Light' },
  { id: 'medium', label: 'Medium' },
  { id: 'medium-dark', label: 'Medium-Dark' },
  { id: 'dark', label: 'Dark' },
];

const EMOJI_COLS = 8;
const SYMBOL_COLS = 8;

const splitIntoRowsStatic = (items, cols, catId) => {
  const rows = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push({
      type: 'row',
      items: items.slice(i, i + cols),
      cols,
      catId,
      id: `${catId}-row-${i}`
    });
  }
  return rows;
};

let emojiDataCache = null;
let emojiMetaCache = null;
let emojiRowsCache = null;
let emojiSkinSupport = null;

const ensureEmojiData = () => {
  if (emojiDataCache) return;
  
  const cnNames = {};
  emojiDataCn.forEach(item => {
    if (item.emoji && item.annotation) {
      cnNames[item.emoji] = item.annotation;
    }
  });

  const grouped = {};
  const metaMap = {};
  const rowsCache = {};
  const skinSupport = new Map();
  
  emojiDataEn.forEach(item => {
    const groupId = GROUP_ID_MAP[item.group];
    if (!groupId) return;
    
    if (!grouped[groupId]) grouped[groupId] = [];
    const entry = {
      emoji: item.emoji,
      name: item.annotation,
      nameCn: cnNames[item.emoji] || item.annotation
    };
    grouped[groupId].push(entry);
    metaMap[item.emoji] = entry;
    
    if (item.skins && item.skins.length > 0) {
      skinSupport.set(item.emoji, item.skins.map(s => s.emoji));
    }
  });

  Object.keys(grouped).forEach(catId => {
    rowsCache[catId] = splitIntoRowsStatic(grouped[catId], EMOJI_COLS, catId);
  });

  emojiDataCache = grouped;
  emojiMetaCache = metaMap;
  emojiRowsCache = rowsCache;
  emojiSkinSupport = skinSupport;
};


function EmojiTab() {
  const { t } = useTranslation();
  const settings = useSnapshot(settingsStore);
  const isChinese = settings.language?.startsWith('zh');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentEmojis, setRecentEmojis] = useState([]);
  const [showSymbols, setShowSymbols] = useState(false);
  const [skinTone, setSkinTone] = useState(() => localStorage.getItem(SKIN_TONE_KEY) || 'default');
  const [skinPickerEmoji, setSkinPickerEmoji] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const scrollContainerRef = useRef(null);
  const activeCategoryRef = useRef('recent');
  const sidebarButtonsRef = useRef({});
  const virtualDataRef = useRef([]); 
  const emojiMetaRef = useRef({});
  const isUserScrollingRef = useRef(false);
  const searchInputRef = useInputFocus();
  const [scrollerElement, setScrollerElement] = useState(null);
  const scrollerRefCallback = useCallback(element => element && setScrollerElement(element), []);
  useCustomScrollbar(scrollerElement);

  useEffect(() => {
    const timer = setTimeout(() => {
      ensureEmojiData();
      emojiMetaRef.current = emojiMetaCache || {};
      setIsReady(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);


  // 加载最近使用
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const normalized = parsed.map(item =>
            typeof item === 'string'
              ? { value: item, name: item, nameCn: item }
              : {
                  value: item?.value || item?.emoji || '',
                  name: item?.name || item?.title || item?.value || '',
                  nameCn: item?.nameCn || item?.name || item?.title || item?.value || ''
                }
          ).filter(entry => entry.value);
          setRecentEmojis(normalized);
        }
      }
    } catch (e) {}
  }, []);


  const formatSymbolTitle = useCallback((char, catId) => {
    const cat = SYMBOL_CATS.find(c => c.id === catId);
    const label = cat ? t(cat.labelKey) : t('emoji.symbols');
    const cp = char?.codePointAt?.(0);
    return cp ? `${label} · U+${cp.toString(16).toUpperCase().padStart(4, '0')}` : label;
  }, [t]);

  // 保存最近使用
  const addToRecent = useCallback((value, name, nameCn) => {
    const meta = emojiMetaRef.current[value];
    const entry = {
      value,
      name: name || meta?.name || value,
      nameCn: nameCn || meta?.nameCn || meta?.name || value
    };
    setRecentEmojis(prev => {
      const filtered = prev.filter(item => item.value !== value);
      const updated = [entry, ...filtered].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // 获取 emoji 的肤色变体
  const getSkinVariants = useCallback((emoji) => {
    const skins = emojiSkinSupport.get(emoji);
    if (!skins) return null;
    return [emoji, ...skins];
  }, []);

  const applySkintone = useCallback((emoji) => {
    if (skinTone === 'default') return emoji;
    const skins = emojiSkinSupport.get(emoji);
    if (!skins) return emoji;
    
    const toneIndex = SKIN_TONES.findIndex(t => t.id === skinTone);
    if (toneIndex <= 0) return emoji;
    return skins[toneIndex - 1] || emoji;
  }, [skinTone]);

  const updateSkinToneFromEmoji = useCallback((emoji, baseEmoji) => {
    const skins = emojiSkinSupport.get(baseEmoji);
    if (!skins) return;
    
    if (emoji === baseEmoji) {
      setSkinTone('default');
      localStorage.setItem(SKIN_TONE_KEY, 'default');
    } else {
      const idx = skins.indexOf(emoji);
      if (idx >= 0 && SKIN_TONES[idx + 1]) {
        setSkinTone(SKIN_TONES[idx + 1].id);
        localStorage.setItem(SKIN_TONE_KEY, SKIN_TONES[idx + 1].id);
      }
    }
  }, []);

  const handleSkinPickerOpen = useCallback((e, baseChar, variants, item, catId) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setSkinPickerEmoji({ baseChar, variants, rect, item, catId });
  }, []);

  // 粘贴
  const handlePaste = useCallback(async (item, catId, skinVariant, baseEmoji) => {
    let char = skinVariant || (typeof item === 'string' ? item : item?.emoji);
    if (!char) return;
    
    if (skinVariant && baseEmoji) {
      updateSkinToneFromEmoji(skinVariant, baseEmoji);
    }
    else if ((catId === 'people-body' || catId === 'recent') && !skinVariant) {
      char = applySkintone(char);
    }
    const meta = emojiMetaRef.current[char];
    const name = typeof item === 'object' ? (item.name || meta?.name) : meta?.name;
    const nameCn = typeof item === 'object' ? (item.nameCn || meta?.nameCn) : meta?.nameCn;
    try {
      await restoreLastFocus();
      await invoke('paste_text_direct', { text: char });
      addToRecent(char, name, nameCn);
    } catch (e) {
      console.error('粘贴失败:', e);
      toast.error(t('common.error'));
    }
  }, [addToRecent, t, applySkintone, updateSkinToneFromEmoji]);

  // 搜索结果
  const searchResults = useMemo(() => {
    const rawQuery = searchQuery.trim();
    if (!rawQuery) return null;
    const query = rawQuery.toLowerCase();
    
    const emojiResults = [];
    Object.values(emojiDataCache).forEach(emojis => {
      emojis.forEach(item => {
        if (item.name?.toLowerCase().includes(query) || item.nameCn?.includes(rawQuery)) {
          emojiResults.push(item);
        }
      });
    });
    
    const symbolResults = [];
    SYMBOL_CATS.forEach(cat => {
      (symbolCategories[cat.id] || []).forEach(ch => {
        if (ch.includes(rawQuery) || ch.toLowerCase().includes(query)) {
          symbolResults.push({ emoji: ch, name: formatSymbolTitle(ch, cat.id) });
        }
      });
    });
    
    return { emojis: emojiResults.slice(0, 100), symbols: symbolResults.slice(0, 50) };
  }, [searchQuery, formatSymbolTitle]);

  const symbolRowsCache = useMemo(() => {
    const cache = {};
    SYMBOL_CATS.forEach(cat => {
      const symbols = (symbolCategories[cat.id] || []).map(ch => ({
        emoji: ch,
        name: formatSymbolTitle(ch, cat.id)
      }));
      cache[cat.id] = splitIntoRowsStatic(symbols, SYMBOL_COLS, cat.id);
    });
    return cache;
  }, [formatSymbolTitle]);

  // 构建虚拟列表数据
  const virtualData = useMemo(() => {
    if (searchQuery && searchResults) {
      const sections = [];
      if (searchResults.emojis.length > 0) {
        sections.push({ type: 'header', title: t('emoji.searchResults'), id: 'header-search-emoji' });
        sections.push(...splitIntoRowsStatic(searchResults.emojis, EMOJI_COLS, 'search-emoji'));
      }
      if (searchResults.symbols.length > 0) {
        sections.push({ type: 'header', title: t('emoji.symbolResults'), id: 'header-search-symbol' });
        sections.push(...splitIntoRowsStatic(searchResults.symbols, SYMBOL_COLS, 'search-symbol'));
      }
      if (sections.length === 0) {
        sections.push({ type: 'empty', id: 'no-results' });
      }
      return sections;
    }
    
    if (showSymbols) {
      const sections = [];
      SYMBOL_CATS.forEach(cat => {
        const rows = symbolRowsCache[cat.id];
        if (rows?.length > 0) {
          sections.push({ type: 'header', title: t(cat.labelKey), id: `header-${cat.id}` });
          sections.push(...rows);
        }
      });
      return sections;
    }
    
    if (!emojiRowsCache) return [];
    const sections = [];
    // 最近使用
    sections.push({ type: 'header', title: t('emoji.recent'), id: 'header-recent' });
    if (recentEmojis.length > 0) {
      const recentEntries = recentEmojis.map(item => ({
        emoji: item.value,
        name: item.name,
        nameCn: item.nameCn
      }));
      sections.push(...splitIntoRowsStatic(recentEntries, EMOJI_COLS, 'recent'));
    } else {
      sections.push({ type: 'empty-recent', id: 'empty-recent' });
    }
    EMOJI_CATS.filter(c => c.id !== 'recent').forEach(cat => {
      const rows = emojiRowsCache[cat.id];
      if (rows?.length > 0) {
        sections.push({ type: 'header', title: t(cat.labelKey), id: `header-${cat.id}` });
        sections.push(...rows);
      }
    });
    return sections;
  }, [searchQuery, searchResults, showSymbols, recentEmojis, t, symbolRowsCache, isReady]);

  virtualDataRef.current = virtualData;

  const updateSidebarHighlight = useCallback((catId) => {
    if (activeCategoryRef.current === catId) return;
    
    const oldBtn = sidebarButtonsRef.current[activeCategoryRef.current];
    if (oldBtn) {
      oldBtn.classList.remove('bg-blue-100', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400');
      oldBtn.classList.add('text-gray-500', 'hover:bg-gray-200', 'dark:hover:bg-gray-700');
    }
    
    const newBtn = sidebarButtonsRef.current[catId];
    if (newBtn) {
      newBtn.classList.remove('text-gray-500', 'hover:bg-gray-200', 'dark:hover:bg-gray-700');
      newBtn.classList.add('bg-blue-100', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400');
    }
    
    activeCategoryRef.current = catId;
  }, []);

  useEffect(() => {
    const firstCat = showSymbols ? SYMBOL_CATS[0]?.id : EMOJI_CATS[0]?.id;
    if (firstCat) {
      activeCategoryRef.current = firstCat;
      scrollContainerRef.current?.scrollToIndex({ index: 0 });
    }
  }, [showSymbols]);

  const scrollToCategory = useCallback((categoryId) => {
    isUserScrollingRef.current = true;
    updateSidebarHighlight(categoryId);
    const targetId = `header-${categoryId}`;
    const index = virtualData.findIndex(item => item.id === targetId);
    if (index >= 0) {
      scrollContainerRef.current?.scrollToIndex({ index, align: 'start' });
    } else {
      scrollContainerRef.current?.scrollToIndex({ index: 0 });
    }
    setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 100);
  }, [virtualData, updateSidebarHighlight]);

  const handleRangeChanged = useCallback((range) => {
    if (isUserScrollingRef.current) return;
    
    const data = virtualDataRef.current;
    const item = data[range.startIndex];
    if (!item) return;
    
    let foundCatId = null;
    if (item.type === 'header') {
      foundCatId = item.id.replace('header-', '');
    } else if (item.type === 'row') {
      foundCatId = item.catId;
    }
    
    if (foundCatId) {
      updateSidebarHighlight(foundCatId);
    }
  }, [updateSidebarHighlight]);

  const renderVirtualItem = useCallback((index) => {
    const section = virtualDataRef.current[index];
    if (!section) return null;
    
    if (section.type === 'header') {
      return (
        <div className="sticky top-0 z-10 px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm">
          {section.title}
        </div>
      );
    }
    
    if (section.type === 'empty') {
      return <div className="text-center text-gray-400 py-8 text-sm">{t('emoji.noResults')}</div>;
    }
    
    if (section.type === 'empty-recent') {
      return <div className="px-2 py-3 text-xs text-gray-400 text-center">{t('emoji.noRecent')}</div>;
    }
    
    if (section.type === 'row') {
      const shouldApplySkin = section.catId === 'people-body';
      return (
        <div 
          className="grid gap-0.5 px-1" 
          style={{ 
            gridTemplateColumns: `repeat(${section.cols}, 1fr)`,
            contentVisibility: 'auto',
            containIntrinsicSize: '0 36px'
          }}
        >
          {section.items.map((item, idx) => {
            const baseChar = typeof item === 'string' ? item : item.emoji;
            const displayChar = shouldApplySkin ? applySkintone(baseChar) : baseChar;
            const skinVariants = shouldApplySkin ? getSkinVariants(baseChar) : null;
            const meta = emojiMetaRef.current[baseChar];
            const name = typeof item === 'object'
              ? (isChinese ? (item.nameCn || item.name) : (item.name || item.nameCn))
              : (isChinese ? (meta?.nameCn || meta?.name) : (meta?.name || meta?.nameCn)) || baseChar;
            return (
              <div key={`${baseChar}-${idx}`} className="relative group">
                <button
                  onClick={() => handlePaste(item, section.catId)}
                  className="aspect-square w-full flex items-center justify-center text-2xl leading-none overflow-hidden text-gray-700 dark:text-gray-200 rounded cursor-pointer active:scale-95 hover:scale-120 hover:z-50 hover:bg-white dark:hover:bg-gray-800 hover:shadow-lg hover:rounded-lg hover:border hover:border-gray-200 dark:hover:border-gray-700"
                  style={{
                    opacity: 0,
                    animation: `fadeIn 0.15s ease-out ${idx * 15}ms forwards`
                  }}
                  title={name}
                >
                  <span className="inline-flex items-center justify-center w-[1.2em] h-[1.2em] overflow-hidden">{displayChar}</span>
                </button>
                {/* 肤色选择按钮 */}
                {skinVariants && (
                  <button
                    onClick={(e) => handleSkinPickerOpen(e, baseChar, skinVariants, item, section.catId)}
                    className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-700 border border-white dark:border-gray-800 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:scale-125"
                    title="选择肤色"
                  />
                )}
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  }, [handlePaste, isChinese, skinTone, applySkintone, getSkinVariants, handleSkinPickerOpen]);

  return (
    <div className="h-full flex bg-gray-50 dark:bg-gray-900">
      {/* 侧边分类栏 */}
      <div className="w-10 flex-shrink-0 bg-gray-100 dark:bg-gray-800/50 border-r border-gray-200 dark:border-gray-700/50 flex flex-col py-1 overflow-y-auto scrollbar-hide">
        {/* Emoji/符号 切换 */}
        <button
          onClick={() => setShowSymbols(false)}
          className={`w-8 h-8 mx-auto mb-0.5 flex items-center justify-center rounded-lg transition-colors ${!showSymbols ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          title={t('emoji.emoji')}
        >
          <span className="text-base">😀</span>
        </button>
        <button
          onClick={() => setShowSymbols(true)}
          className={`w-8 h-8 mx-auto mb-1.5 flex items-center justify-center rounded-lg transition-colors ${showSymbols ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          title={t('emoji.symbols')}
        >
          <i className="ti ti-math-symbols text-lg"></i>
        </button>
        
        <div className="w-5 h-px bg-gray-300 dark:bg-gray-600 mx-auto mb-1.5"></div>
        
        {/* 分类按钮 */}
        {(showSymbols ? SYMBOL_CATS : EMOJI_CATS).map((cat, idx) => (
          <button
            key={cat.id}
            ref={el => sidebarButtonsRef.current[cat.id] = el}
            onClick={() => scrollToCategory(cat.id)}
            className={`w-8 h-8 mx-auto mb-0.5 flex items-center justify-center rounded-lg transition-colors ${
              idx === 0 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            title={t(cat.labelKey)}
          >
            <i className={`ti ${cat.icon} text-base`}></i>
          </button>
        ))}
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 搜索框 */}
        <div className="flex-shrink-0 p-2 border-b border-gray-200 dark:border-gray-700/50">
          <div className="relative">
            <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('emoji.searchPlaceholder')}
              className="w-full h-8 pl-8 pr-8 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <i className="ti ti-x text-sm"></i>
              </button>
            )}
          </div>
        </div>

        {/* 内容滚动区 */}
        <div className="flex-1 overflow-hidden custom-scrollbar-container">
          {!isReady ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <i className="ti ti-loader-2 animate-spin mr-2"></i>
              {t('common.loading')}
            </div>
          ) : (
            <Virtuoso
              ref={scrollContainerRef}
              totalCount={virtualData.length}
              itemContent={renderVirtualItem}
              computeItemKey={(index) => virtualData[index]?.id || index}
              rangeChanged={handleRangeChanged}
              scrollerRef={scrollerRefCallback}
              overscan={10}
              className="h-full"
              style={{ height: '100%' }}
            />
          )}
        </div>
      </div>

      {/* 肤色选择器 */}
      {skinPickerEmoji && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setSkinPickerEmoji(null)} />
          <div 
            className="fixed z-[200] flex gap-1 p-1.5 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700"
            onMouseLeave={() => setSkinPickerEmoji(null)}
            style={(() => {
              const { rect } = skinPickerEmoji;
              const pickerWidth = 220;
              const pickerHeight = 40;
              let left = rect.left + rect.width / 2 - pickerWidth / 2;
              let top = rect.top - pickerHeight - 8;
              if (top < 10) {
                top = rect.bottom + 8;
              }
              if (left < 10) left = 10;
              if (left + pickerWidth > window.innerWidth - 10) left = window.innerWidth - pickerWidth - 10;
              return { left, top };
            })()}
          >
            {skinPickerEmoji.variants.map((variant, i) => {
              const isCurrent = (i === 0 && skinTone === 'default') || (i > 0 && SKIN_TONES[i]?.id === skinTone);
              return (
                <button
                  key={variant}
                  onClick={() => {
                    handlePaste(skinPickerEmoji.item, skinPickerEmoji.catId, variant, skinPickerEmoji.baseChar);
                    setSkinPickerEmoji(null);
                  }}
                  className={`w-8 h-8 flex items-center justify-center text-xl rounded-lg transition-all hover:scale-110 ${
                    isCurrent
                      ? 'bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-500'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title={SKIN_TONES[i]?.label || 'Default'}
                >
                  {variant}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default EmojiTab;
