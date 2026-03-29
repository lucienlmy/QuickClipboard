import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { toast } from '@shared/store/toastStore';
import { Virtuoso } from 'react-virtuoso';
import { useInputFocus } from '@shared/hooks/useInputFocus';
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar';
import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';
import { restoreLastFocus } from '@shared/api/window';
import { ImageLibraryTab } from './emoji';
import Tooltip from '@shared/components/common/Tooltip.jsx';
import {
  SYMBOL_CATS, EMOJI_CATS, IMAGE_CATS, SKIN_TONES,
  RECENT_KEY, SKIN_TONE_KEY, MAX_RECENT,
  symbolCategories,
  ensureEmojiData, getEmojiDataCache, getEmojiMetaCache, getEmojiSkinSupport
} from './emoji/emojiData';

const DEFAULT_GRID_COLS = 8;
const GRID_MIN_COLS = 4;
const GRID_MAX_COLS = 12;
const GRID_MIN_CELL_WIDTH = 42;
const GRID_GAP_PX = 2;
const GRID_HORIZONTAL_PADDING_PX = 8;

const splitIntoRowsResponsive = (items, cols, catId) => {
  const rows = [];
  if (!Array.isArray(items) || items.length === 0) return rows;

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

const getResponsiveGridCols = (width) => {
  if (!width) return DEFAULT_GRID_COLS;

  const availableWidth = Math.max(0, width - GRID_HORIZONTAL_PADDING_PX);
  const rawCols = Math.floor((availableWidth + GRID_GAP_PX) / (GRID_MIN_CELL_WIDTH + GRID_GAP_PX));
  return Math.max(GRID_MIN_COLS, Math.min(GRID_MAX_COLS, rawCols || DEFAULT_GRID_COLS));
};

const PreviewTooltipCard = ({ char, title, subtitle, codeLabel, sizeClass = 'text-[36px]' }) => {
  return (
    <div className="flex items-center gap-3 px-1 py-0.5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-qc-active ring-1 ring-qc-border">
        <span className={`${sizeClass} leading-none`}>{char}</span>
      </div>
      <div className="min-w-0">
        <div className="max-w-[220px] text-[15px] font-semibold leading-snug text-qc-fg break-words">
          {title}
        </div>
        {(subtitle || codeLabel) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-snug text-qc-fg-subtle">
            {subtitle ? <span>{subtitle}</span> : null}
            {codeLabel ? <span>{codeLabel}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
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
  const [isModeReady, setIsModeReady] = useState(true);
  const [contentWidth, setContentWidth] = useState(0);
  const prevEmojiModeRef = useRef(emojiMode);
  const scrollContainerRef = useRef(null);
  const contentMeasureRef = useRef(null);
  const activeCategoryRef = useRef('recent');
  const sidebarButtonsRef = useRef({});
  const virtualDataRef = useRef([]); 
  const emojiMetaRef = useRef({});
  const isUserScrollingRef = useRef(false);
  const searchInputRef = useInputFocus();
  const [scrollerElement, setScrollerElement] = useState(null);
  const scrollerRefCallback = useCallback(element => element && setScrollerElement(element), []);
  useCustomScrollbar(scrollerElement);
  const gridCols = useMemo(() => getResponsiveGridCols(contentWidth), [contentWidth]);

  useEffect(() => {
    const timer = setTimeout(() => {
      ensureEmojiData();
      emojiMetaRef.current = getEmojiMetaCache() || {};
      setIsReady(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useLayoutEffect(() => {
    if (showImages) return undefined;

    const target = contentMeasureRef.current;
    if (!target) return undefined;

    let rafId = 0;
    let observer = null;

    const measure = () => {
      rafId = requestAnimationFrame(() => {
        const nextWidth = target.clientWidth || 0;
        setContentWidth(prev => (prev === nextWidth ? prev : nextWidth));
      });
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(target);
    } else {
      window.addEventListener('resize', measure);
    }

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener('resize', measure);
      }
    };
  }, [showImages]);


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
    const skins = getEmojiSkinSupport()?.get(emoji);
    if (!skins) return null;
    return [emoji, ...skins];
  }, []);

  const applySkintone = useCallback((emoji) => {
    if (skinTone === 'default') return emoji;
    const skins = getEmojiSkinSupport()?.get(emoji);
    if (!skins) return emoji;
    
    const toneIndex = SKIN_TONES.findIndex(t => t.id === skinTone);
    if (toneIndex <= 0) return emoji;
    return skins[toneIndex - 1] || emoji;
  }, [skinTone]);

  const updateSkinToneFromEmoji = useCallback((emoji, baseEmoji) => {
    const skins = getEmojiSkinSupport()?.get(baseEmoji);
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
    const emojiDataCache = getEmojiDataCache();
    if (emojiDataCache) Object.values(emojiDataCache).forEach(emojis => {
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
      cache[cat.id] = splitIntoRowsResponsive(symbols, gridCols, cat.id);
    });
    return cache;
  }, [formatSymbolTitle, gridCols]);

  // 构建虚拟列表数据
  const virtualData = useMemo(() => {
    if (!isModeReady) return [];
    const emojiDataCache = getEmojiDataCache();
    
    if (searchQuery && searchResults) {
      const sections = [];
      if (searchResults.emojis.length > 0) {
        sections.push({ type: 'header', title: t('emoji.searchResults'), id: 'header-search-emoji' });
        sections.push(...splitIntoRowsResponsive(searchResults.emojis, gridCols, 'search-emoji'));
      }
      if (searchResults.symbols.length > 0) {
        sections.push({ type: 'header', title: t('emoji.symbolResults'), id: 'header-search-symbol' });
        sections.push(...splitIntoRowsResponsive(searchResults.symbols, gridCols, 'search-symbol'));
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
    
    if (!emojiDataCache) return [];
    const sections = [];
    // 最近使用
    sections.push({ type: 'header', title: t('emoji.recent'), id: 'header-recent' });
    if (recentEmojis.length > 0) {
      const recentEntries = recentEmojis.map(item => ({
        emoji: item.value,
        name: item.name,
        nameCn: item.nameCn
      }));
      sections.push(...splitIntoRowsResponsive(recentEntries, gridCols, 'recent'));
    } else {
      sections.push({ type: 'empty-recent', id: 'empty-recent' });
    }
    EMOJI_CATS.filter(c => c.id !== 'recent').forEach(cat => {
      const rows = splitIntoRowsResponsive(emojiDataCache?.[cat.id] || [], gridCols, cat.id);
      if (rows?.length > 0) {
        sections.push({ type: 'header', title: t(cat.labelKey), id: `header-${cat.id}` });
        sections.push(...rows);
      }
    });
    return sections;
  }, [searchQuery, searchResults, emojiMode, recentEmojis, t, symbolRowsCache, isReady, isModeReady, gridCols]);

  virtualDataRef.current = virtualData;

  const updateSidebarHighlight = useCallback((catId) => {
    if (activeCategoryRef.current === catId) return;
    
    const oldBtn = sidebarButtonsRef.current[activeCategoryRef.current];
    if (oldBtn) {
      oldBtn.classList.remove('bg-blue-100', 'text-blue-600');
      oldBtn.classList.add('text-qc-fg-muted', 'hover:bg-qc-hover');
    }
    
    const newBtn = sidebarButtonsRef.current[catId];
    if (newBtn) {
      newBtn.classList.remove('text-qc-fg-muted', 'hover:bg-qc-hover');
      newBtn.classList.add('bg-blue-100', 'text-blue-600');
    }
    
    activeCategoryRef.current = catId;
  }, []);

  useEffect(() => {
    setSearchQuery('');
    
    if (showImages) {
      setImageCategory('images');
    } else {
      const firstCat = showSymbols ? SYMBOL_CATS[0]?.id : EMOJI_CATS[0]?.id;
      if (firstCat) {
        activeCategoryRef.current = firstCat;
        scrollContainerRef.current?.scrollToIndex({ index: 0 });
      }
    }
  }, [emojiMode]);

  useEffect(() => {
    const prevMode = prevEmojiModeRef.current;
    prevEmojiModeRef.current = emojiMode;
    
    if (emojiMode === 'emoji' && prevMode !== 'emoji') {
      setIsModeReady(false);
      const timer = setTimeout(() => {
        setIsModeReady(true);
      }, 250);
      return () => clearTimeout(timer);
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
    const uiAnimationEnabled = settingsStore.uiAnimationEnabled !== false;
    
    if (section.type === 'header') {
      return (
        <div className="sticky top-0 z-10 px-2 py-1.5 text-xs font-medium text-qc-fg-muted bg-qc-panel/90 backdrop-blur-sm">
          {section.title}
        </div>
      );
    }
    
    if (section.type === 'empty') {
      return <div className="text-center text-qc-fg-subtle py-8 text-sm">{t('emoji.noResults')}</div>;
    }
    
    if (section.type === 'empty-recent') {
      return <div className="px-2 py-3 text-xs text-qc-fg-subtle text-center">{t('emoji.noRecent')}</div>;
    }
    
    if (section.type === 'row') {
      const shouldApplySkin = section.catId === 'people-body';
      return (
        <div 
          className="grid gap-0.5 px-1" 
          style={{ 
            gridTemplateColumns: `repeat(${section.cols}, minmax(0, 1fr))`,
            contentVisibility: 'auto',
            containIntrinsicSize: '0 36px'
          }}
        >
          {section.items.map((item, idx) => {
            const baseChar = typeof item === 'string' ? item : item.emoji;
            const displayChar = shouldApplySkin ? applySkintone(baseChar) : baseChar;
            const skinVariants = shouldApplySkin ? getSkinVariants(baseChar) : null;
            const meta = emojiMetaRef.current[baseChar];
            const codePoint = baseChar?.codePointAt?.(0);
            const codeLabel = codePoint ? `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}` : '';
            const name = typeof item === 'object'
              ? (isChinese ? (item.nameCn || item.name) : (item.name || item.nameCn))
              : (isChinese ? (meta?.nameCn || meta?.name) : (meta?.name || meta?.nameCn)) || baseChar;
            return (
              <div key={`${baseChar}-${idx}`} className="relative group">
                <Tooltip
                  content={
                    <PreviewTooltipCard
                      char={displayChar}
                      title={name}
                      subtitle={section.catId === 'symbols'
                        ? t('emoji.symbols')
                        : (section.catId === 'people-body' ? t('emoji.people') : '')}
                      codeLabel={codeLabel}
                      sizeClass={section.catId === 'symbols' ? 'text-[27px]' : 'text-[34px]'}
                    />
                  }
                  placement="top"
                  maxWidth={360}
                  asChild
                >
                  <button
                    onClick={() => handlePaste(item, section.catId)}
                    className={`aspect-square w-full flex items-center justify-center text-2xl leading-none text-qc-fg rounded cursor-pointer transition-[transform,box-shadow,background-color,border-color] ${uiAnimationEnabled ? 'active:scale-95 hover:bg-qc-panel hover:shadow-lg hover:border hover:border-qc-border' : 'hover:bg-qc-hover'}`}
                    style={uiAnimationEnabled ? {
                      opacity: 0,
                      animation: `fadeIn 0.15s ease-out ${idx * 15}ms forwards`
                    } : {}}
                  >
                    <span className="inline-flex items-center justify-center w-[1.2em] h-[1.2em] overflow-hidden">{displayChar}</span>
                  </button>
                </Tooltip>
                {/* 肤色选择按钮 */}
                {skinVariants && (
                  <Tooltip content="选择肤色" placement="left" asChild>
                    <button
                      onClick={(e) => handleSkinPickerOpen(e, baseChar, skinVariants, item, section.catId)}
                      className={`absolute top-0.5 right-0.5 z-10 w-3 h-3 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-700 border border-white opacity-0 group-hover:opacity-100 shadow-sm ${uiAnimationEnabled ? 'transition-opacity hover:scale-125' : ''}`}
                    />
                  </Tooltip>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  }, [handlePaste, isChinese, skinTone, applySkintone, getSkinVariants, handleSkinPickerOpen]);

  const currentCategories = useMemo(() => {
    if (showImages) return IMAGE_CATS;
    if (showSymbols) return SYMBOL_CATS;
    return EMOJI_CATS;
  }, [showImages, showSymbols]);

  const handleImageCategoryClick = useCallback((catId) => {
    setImageCategory(catId);
  }, []);

  const handleCategoryClick = useCallback((catId) => {
    if (showImages) {
      handleImageCategoryClick(catId);
    } else {
      scrollToCategory(catId);
    }
  }, [showImages, handleImageCategoryClick, scrollToCategory]);

  const activeCategory = showImages ? imageCategory : activeCategoryRef.current;

  return (
    <div className="h-full flex bg-qc-surface">
      {/* 侧边分类栏 */}
      <div className="emoji-sidebar w-10 flex-shrink-0 bg-qc-panel border-r border-qc-border flex flex-col py-1 overflow-y-auto scrollbar-hide">
        {/* 分类按钮 */}
        {currentCategories.map((cat, idx) => (
          <Tooltip key={cat.id} content={t(cat.labelKey)} placement="right" asChild>
            <button
              ref={el => sidebarButtonsRef.current[cat.id] = el}
              onClick={() => handleCategoryClick(cat.id)}
              className={`w-8 h-8 mx-auto mb-0.5 flex items-center justify-center rounded-lg transition-colors ${
                (showImages ? imageCategory === cat.id : idx === 0) 
                  ? 'bg-blue-100 text-blue-600' 
                  : 'text-qc-fg-muted hover:bg-qc-hover'
              }`}
            >
              <i className={`ti ${cat.icon} text-base`}></i>
            </button>
          </Tooltip>
        ))}
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 搜索框 */}
        <div className="emoji-search-bar flex-shrink-0 p-2 border-b border-qc-border">
          <div className="relative">
            <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-qc-fg-subtle text-sm"></i>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={showImages ? (t('emoji.searchImagePlaceholder') || '搜索文件名...') : t('emoji.searchPlaceholder')}
              className="w-full h-8 pl-8 pr-8 text-sm bg-qc-panel border border-qc-border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-qc-fg placeholder:text-qc-fg-subtle"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-qc-fg-subtle hover:text-qc-fg-muted">
                <i className="ti ti-x text-sm"></i>
              </button>
            )}
          </div>
        </div>

        {/* 内容滚动区 */}
        {showImages ? (
          <ImageLibraryTab imageCategory={imageCategory} searchQuery={searchQuery} />
        ) : (
        <div ref={contentMeasureRef} className="emoji-content flex-1 overflow-hidden custom-scrollbar-container">
          {(!isReady || !isModeReady) ? (
            <div className="flex items-center justify-center h-32 text-qc-fg-subtle">
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
        )}
      </div>

      {/* 肤色选择器 */}
      {skinPickerEmoji && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setSkinPickerEmoji(null)} />
          <div 
            className="fixed z-[200] flex gap-1 p-1.5 bg-qc-panel rounded-xl shadow-xl border border-qc-border"
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
                <Tooltip key={variant} content={SKIN_TONES[i]?.label || 'Default'} placement="top" asChild>
                  <button
                    onClick={() => {
                      handlePaste(skinPickerEmoji.item, skinPickerEmoji.catId, variant, skinPickerEmoji.baseChar);
                      setSkinPickerEmoji(null);
                    }}
                    className={`w-8 h-8 flex items-center justify-center text-xl rounded-lg transition-all hover:scale-110 ${
                      isCurrent
                        ? 'bg-blue-100 ring-2 ring-blue-500'
                        : 'hover:bg-qc-hover'
                    }`}
                  >
                    {variant}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default EmojiTab;
