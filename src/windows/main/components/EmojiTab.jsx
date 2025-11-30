import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { toast, TOAST_SIZES, TOAST_POSITIONS } from '@shared/store/toastStore';
import { restoreLastFocus } from '@shared/api/window';
import { Virtuoso } from 'react-virtuoso';
import { useInputFocus, focusWindowImmediately, restoreFocus } from '@shared/hooks/useInputFocus';
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar';
import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';
import emojiDataEn from 'emoji-picker-element-data/en/cldr/data.json';
import emojiDataCn from 'emoji-picker-element-data/zh/cldr/data.json';
import * as imageLibrary from '@shared/api/imageLibrary';

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

// 图片分类配置
const IMAGE_CATS = [
  { id: 'images', icon: 'ti-photo', labelKey: 'emoji.cat.images' },
  { id: 'gifs', icon: 'ti-gif', labelKey: 'emoji.cat.gifs' },
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
const IMAGE_COLS = 2;

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


function EmojiTab({ emojiMode, onEmojiModeChange }) {
  const showSymbols = emojiMode === 'symbols';
  const showImages = emojiMode === 'images';
  const { t } = useTranslation();
  const settings = useSnapshot(settingsStore);
  const isChinese = settings.language?.startsWith('zh');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentEmojis, setRecentEmojis] = useState([]);
  const [imageCategory, setImageCategory] = useState('images'); // 'images' | 'gifs'
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
  }, [searchQuery, searchResults, emojiMode, recentEmojis, t, symbolRowsCache, isReady]);

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
  }, [emojiMode]);

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

  // 图片页面状态
  const [imageTotal, setImageTotal] = useState(0);
  const [imageItems, setImageItems] = useState([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [renamingItem, setRenamingItem] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const loadedRangeRef = useRef({ start: 0, end: 0 });
  const imageScrollerRef = useRef(null);
  const imageSearchInputRef = useInputFocus();

  // 加载图片总数
  const loadImageCount = useCallback(async () => {
    try {
      const category = imageCategory === 'gifs' ? 'gifs' : 'images';
      const count = await imageLibrary.getImageCount(category);
      setImageTotal(count);
      if (count === 0) {
        setImageItems([]);
      }
    } catch (err) {
      console.error('加载图片总数失败:', err);
    }
  }, [imageCategory]);

  // 加载图片列表（按需）
  const loadImageRange = useCallback(async (startIndex, endIndex) => {
    if (imageLoading) return;
    
    const category = imageCategory === 'gifs' ? 'gifs' : 'images';
    const rowStart = Math.floor(startIndex / IMAGE_COLS) * IMAGE_COLS;
    const rowEnd = Math.ceil((endIndex + 1) / IMAGE_COLS) * IMAGE_COLS;
    
    if (rowStart >= loadedRangeRef.current.start && rowEnd <= loadedRangeRef.current.end) {
      return;
    }
    
    setImageLoading(true);
    try {
      const result = await imageLibrary.getImageList(category, rowStart, rowEnd - rowStart + 20);
      setImageItems(prev => {
        const newItems = [...prev];
        result.items.forEach((item, idx) => {
          newItems[rowStart + idx] = item;
        });
        return newItems;
      });
      loadedRangeRef.current = { 
        start: Math.min(loadedRangeRef.current.start || rowStart, rowStart), 
        end: Math.max(loadedRangeRef.current.end || rowEnd, rowStart + result.items.length) 
      };
    } catch (err) {
      console.error('加载图片列表失败:', err);
    } finally {
      setImageLoading(false);
    }
  }, [imageCategory, imageLoading]);

  // 切换分类时重新加载
  useEffect(() => {
    if (showImages) {
      setImageItems([]);
      setImageSearchQuery('');
      loadedRangeRef.current = { start: 0, end: 0 };
      loadImageCount();
    }
  }, [imageCategory, showImages, loadImageCount]);

  // 处理拖放
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      toast.warning(t('emoji.noValidImages') || '没有有效的图片文件', {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
      return;
    }

    let gifCount = 0;
    let imageCount = 0;

    for (const file of imageFiles) {
      try {
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        
        const result = await imageLibrary.saveImage(file.name, data);
        
        if (result.category === 'gifs') gifCount++;
        else imageCount++;
      } catch (err) {
        console.error('保存图片失败:', err);
        toast.error(`保存失败: ${file.name}`, {
          size: TOAST_SIZES.EXTRA_SMALL,
          position: TOAST_POSITIONS.BOTTOM_RIGHT
        });
      }
    }

    // 显示分类结果
    const parts = [];
    if (imageCount > 0) parts.push(`${imageCount} 张图片`);
    if (gifCount > 0) parts.push(`${gifCount} 张 GIF`);
    if (parts.length > 0) {
      toast.success(`已添加 ${parts.join('、')}`, {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
    
    loadImageCount();
    loadedRangeRef.current = { start: 0, end: 0 };
    setImageItems([]);
  }, [t, loadImageCount]);

  // 点击图片粘贴
  const handleImageClick = useCallback(async (item) => {
    if (!item || item.loading) return;
    
    try {
      await restoreLastFocus();
      await invoke('paste_image_file', { filePath: item.path });
      toast.success(t('common.pasted') || '已粘贴', {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    } catch (err) {
      console.error('粘贴图片失败:', err);
      toast.error(t('common.pasteFailed') || '粘贴失败', {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
  }, [t]);

  const handleDeleteImage = useCallback(async (e, item) => {
    e.stopPropagation();
    if (!item || item.loading) return;
    
    try {
      await imageLibrary.deleteImage(item.category, item.filename);
      loadImageCount();
      loadedRangeRef.current = { start: 0, end: 0 };
      setImageItems([]);
    } catch (err) {
      console.error('删除图片失败:', err);
      toast.error(t('common.deleteFailed') || '删除失败', {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
  }, [t, loadImageCount]);

  const handleRenameStart = useCallback((e, item) => {
    e.stopPropagation();
    if (!item || item.loading) return;
    const nameWithoutExt = item.filename.replace(/\.[^/.]+$/, '');
    setRenamingItem(item);
    setRenameValue(nameWithoutExt);
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!renamingItem || !renameValue.trim()) {
      setRenamingItem(null);
      return;
    }
    
    try {
      await imageLibrary.renameImage(renamingItem.category, renamingItem.filename, renameValue.trim());
      loadImageCount();
      loadedRangeRef.current = { start: 0, end: 0 };
      setImageItems([]);
      setRenamingItem(null);
    } catch (err) {
      console.error('重命名失败:', err);
      toast.error(err || '重命名失败', {
        size: TOAST_SIZES.EXTRA_SMALL,
        position: TOAST_POSITIONS.BOTTOM_RIGHT
      });
    }
  }, [renamingItem, renameValue, loadImageCount]);

  const handleRenameCancel = useCallback(() => {
    setRenamingItem(null);
    setRenameValue('');
  }, []);

  // 过滤后的图片列表
  const filteredImageItems = useMemo(() => {
    if (!imageSearchQuery.trim()) return imageItems;
    const query = imageSearchQuery.toLowerCase();
    return imageItems.filter(item => 
      item && !item.loading && item.filename.toLowerCase().includes(query)
    );
  }, [imageItems, imageSearchQuery]);

  const filteredImageTotal = useMemo(() => {
    if (!imageSearchQuery.trim()) return imageTotal;
    return filteredImageItems.length;
  }, [imageSearchQuery, imageTotal, filteredImageItems]);

  // 图片虚拟列表数据
  const imageRowCount = useMemo(() => {
    const total = imageSearchQuery.trim() ? filteredImageTotal : imageTotal;
    return Math.ceil(total / IMAGE_COLS);
  }, [imageTotal, filteredImageTotal, imageSearchQuery]);

  // 渲染图片行
  const renderImageRow = useCallback((rowIndex) => {
    const items = imageSearchQuery.trim() ? filteredImageItems : imageItems;
    const total = imageSearchQuery.trim() ? filteredImageTotal : imageTotal;
    const startIdx = rowIndex * IMAGE_COLS;
    const rowItems = [];
    
    for (let i = 0; i < IMAGE_COLS; i++) {
      const idx = startIdx + i;
      if (idx >= total) break;
      const item = items[idx];
      rowItems.push(item || { id: `loading-${idx}`, loading: true });
    }

    if (!imageSearchQuery.trim() && rowItems.some(item => item.loading)) {
      loadImageRange(startIdx, startIdx + IMAGE_COLS - 1);
    }

    return (
      <div className="grid grid-cols-2 gap-2 px-2 py-1" data-no-drag>
        {rowItems.map((item, idx) => (
          <div
            key={item.id}
            onClick={() => handleImageClick(item)}
            role="button"
            className="relative group aspect-square rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors overflow-hidden hover:ring-2 hover:ring-blue-400"
          >
            {item.loading ? (
              <i className="ti ti-loader-2 animate-spin text-2xl text-gray-400"></i>
            ) : (
              <>
                <img 
                  src={imageLibrary.getImageUrl(item.path)} 
                  alt={item.filename}
                  className="w-full h-full object-cover pointer-events-none"
                  loading="lazy"
                />
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleRenameStart(e, item)}
                    className="w-5 h-5 rounded-full bg-black/50 hover:bg-blue-500 text-white flex items-center justify-center"
                    title={t('common.rename') || '重命名'}
                  >
                    <i className="ti ti-pencil text-xs"></i>
                  </button>
                  <button
                    onClick={(e) => handleDeleteImage(e, item)}
                    className="w-5 h-5 rounded-full bg-black/50 hover:bg-red-500 text-white flex items-center justify-center"
                    title={t('common.delete') || '删除'}
                  >
                    <i className="ti ti-x text-xs"></i>
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }, [imageTotal, imageItems, filteredImageItems, filteredImageTotal, imageSearchQuery, loadImageRange, handleImageClick, handleDeleteImage, handleRenameStart, t]);

  // 图片模式渲染
  if (showImages) {
    return (
      <div 
        className={`h-full flex bg-gray-50 dark:bg-gray-900 relative ${isDragging ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 侧边分类栏 */}
        <div className="w-10 flex-shrink-0 bg-gray-100 dark:bg-gray-800/50 border-r border-gray-200 dark:border-gray-700/50 flex flex-col py-1 overflow-y-auto scrollbar-hide">
          {IMAGE_CATS.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setImageCategory(cat.id)}
              className={`w-8 h-8 mx-auto mb-0.5 flex items-center justify-center rounded-lg transition-colors ${
                imageCategory === cat.id 
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                  : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
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
                ref={imageSearchInputRef}
                type="text"
                value={imageSearchQuery}
                onChange={e => setImageSearchQuery(e.target.value)}
                placeholder={t('emoji.searchImagePlaceholder') || '搜索文件名...'}
                className="w-full h-8 pl-8 pr-8 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
              {imageSearchQuery && (
                <button onClick={() => setImageSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <i className="ti ti-x text-sm"></i>
                </button>
              )}
            </div>
          </div>

          {imageTotal === 0 ? (
            /* 空白状态 */
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <div className={`w-20 h-20 rounded-2xl border-2 border-dashed flex items-center justify-center mb-3 transition-colors ${
                isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'
              }`}>
                <i className={`ti ${imageCategory === 'gifs' ? 'ti-gif' : 'ti-photo'} text-4xl ${isDragging ? 'text-blue-500' : ''}`}></i>
              </div>
              <p className="text-sm mb-1">{t('emoji.dragToAdd') || '拖入图片添加'}</p>
              <p className="text-xs text-gray-400">{t('emoji.supportFormats') || '支持 PNG, JPG, GIF, WebP'}</p>
            </div>
          ) : imageRowCount === 0 ? (
            /* 搜索无结果 */
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-400 dark:text-gray-500 text-sm">{t('common.noResults') || '无搜索结果'}</p>
            </div>
          ) : (
            /* 图片列表 */
            <div className="flex-1 overflow-hidden custom-scrollbar-container">
              <Virtuoso
                ref={imageScrollerRef}
                totalCount={imageRowCount}
                itemContent={renderImageRow}
                computeItemKey={(index) => `row-${imageCategory}-${imageSearchQuery}-${index}`}
                scrollerRef={scrollerRefCallback}
                overscan={3}
                className="h-full"
                style={{ height: '100%' }}
              />
            </div>
          )}
        </div>

        {/* 拖放遮罩 */}
        {isDragging && (
          <div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center z-10">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg px-6 py-4 flex items-center gap-3">
              <i className="ti ti-upload text-2xl text-blue-500"></i>
              <span className="text-gray-700 dark:text-gray-200">{t('emoji.dropToAdd') || '松开添加图片'}</span>
            </div>
          </div>
        )}

        {/* 重命名弹窗 */}
        {renamingItem && (
          <>
            <div className="fixed inset-0 bg-black/30 z-[199]" onClick={handleRenameCancel} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 w-72">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                {t('common.rename') || '重命名'}
              </h3>
              <input
                type="text"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRenameConfirm();
                  if (e.key === 'Escape') handleRenameCancel();
                }}
                onFocus={focusWindowImmediately}
                onBlur={restoreFocus}
                autoFocus
                className="w-full h-9 px-3 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={handleRenameCancel}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {t('common.cancel') || '取消'}
                </button>
                <button
                  onClick={handleRenameConfirm}
                  className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  {t('common.confirm') || '确定'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex bg-gray-50 dark:bg-gray-900">
      {/* 侧边分类栏 */}
      <div className="w-10 flex-shrink-0 bg-gray-100 dark:bg-gray-800/50 border-r border-gray-200 dark:border-gray-700/50 flex flex-col py-1 overflow-y-auto scrollbar-hide">
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
