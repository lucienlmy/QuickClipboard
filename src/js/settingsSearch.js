/**
 * 设置页面搜索功能模块
 * 提供搜索设置项、导航跳转等功能
 */

class SettingsSearch {
    constructor() {
        this.searchInput = null;
        this.searchResults = null;
        this.searchClear = null;
        this.searchIndex = [];
        this.isInitialized = false;
        
        // 防抖定时器
        this.searchDebounceTimer = null;
    }

    /**
     * 初始化搜索功能
     */
    init() {
        this.initElements();
        this.buildSearchIndex();
        this.bindEvents();
        this.isInitialized = true;
        console.log('设置搜索功能已初始化');
    }

    /**
     * 初始化DOM元素
     */
    initElements() {
        this.searchInput = document.getElementById('settings-search');
        this.searchResults = document.getElementById('search-results');
        this.searchClear = document.getElementById('search-clear');

        if (!this.searchInput || !this.searchResults || !this.searchClear) {
            console.error('搜索功能初始化失败：找不到必要的DOM元素');
            return;
        }
    }

    /**
     * 构建搜索索引
     */
    buildSearchIndex() {
        this.searchIndex = [];
        
        // 获取所有设置项
        const settingSections = document.querySelectorAll('.settings-section');
        
        settingSections.forEach(section => {
            const sectionId = section.id;
            const sectionTitle = section.querySelector('.section-header h2')?.textContent || '';
            const sectionDescription = section.querySelector('.section-header p')?.textContent || '';
            
            // 获取导航项信息
            const navItem = document.querySelector(`[data-section="${sectionId.replace('-section', '')}"]`);
            const navTitle = navItem?.querySelector('span')?.textContent || '';
            
            // 获取该节下的所有设置项
            const settingItems = section.querySelectorAll('.setting-item');
            
            settingItems.forEach(item => {
                const label = item.querySelector('.setting-label')?.textContent || '';
                const description = item.querySelector('.setting-description')?.textContent || '';
                const id = item.querySelector('input, select, textarea')?.id || '';
                
                if (label) {
                    this.searchIndex.push({
                        id: id,
                        title: label,
                        description: description,
                        section: sectionId,
                        sectionTitle: navTitle || sectionTitle,
                        element: item,
                        keywords: [
                            label,
                            description,
                            navTitle,
                            sectionTitle,
                            sectionDescription
                        ].filter(Boolean).join(' ').toLowerCase()
                    });
                }
            });
        });

        console.log(`已构建搜索索引，共 ${this.searchIndex.length} 个设置项`);
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 搜索输入事件
        this.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            this.handleSearch(query);
        });

        // 清空搜索
        this.searchClear.addEventListener('click', () => {
            this.clearSearch();
        });

        // 键盘事件
        this.searchInput.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });

        // 点击外部关闭搜索结果
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.header-search')) {
                this.hideResults();
            }
        });

        // 焦点事件
        this.searchInput.addEventListener('focus', () => {
            if (this.searchInput.value.trim()) {
                this.showResults();
            }
        });
    }

    /**
     * 处理搜索
     */
    handleSearch(query) {
        // 清除防抖定时器
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }

        // 显示/隐藏清空按钮
        this.searchClear.style.display = query ? 'block' : 'none';

        if (!query) {
            this.hideResults();
            return;
        }

        // 防抖搜索
        this.searchDebounceTimer = setTimeout(() => {
            this.performSearch(query);
        }, 200);
    }

    /**
     * 执行搜索
     */
    performSearch(query) {
        const results = this.searchIndex.filter(item => {
            return item.keywords.includes(query.toLowerCase());
        });

        // 按匹配度排序
        results.sort((a, b) => {
            const aScore = this.calculateMatchScore(a, query);
            const bScore = this.calculateMatchScore(b, query);
            return bScore - aScore;
        });

        this.displayResults(results, query);
    }

    /**
     * 计算匹配分数
     */
    calculateMatchScore(item, query) {
        const lowerQuery = query.toLowerCase();
        let score = 0;

        // 标题完全匹配得分最高
        if (item.title.toLowerCase() === lowerQuery) {
            score += 100;
        } else if (item.title.toLowerCase().includes(lowerQuery)) {
            score += 50;
        }

        // 描述匹配
        if (item.description.toLowerCase().includes(lowerQuery)) {
            score += 20;
        }

        // 节标题匹配
        if (item.sectionTitle.toLowerCase().includes(lowerQuery)) {
            score += 10;
        }

        return score;
    }

    /**
     * 显示搜索结果
     */
    displayResults(results, query) {
        if (results.length === 0) {
            this.searchResults.innerHTML = `
                <div class="search-no-results">
                    <div class="no-results-icon">
                        <i class="ti ti-search-off"></i>
                    </div>
                    <div class="no-results-text">未找到相关设置项</div>
                    <div class="no-results-tip">尝试使用不同的关键词</div>
                </div>
            `;
        } else {
            this.searchResults.innerHTML = results.map(item => {
                const highlightedTitle = this.highlightText(item.title, query);
                const highlightedDescription = this.highlightText(item.description, query);
                
                return `
                    <div class="search-result-item" data-section="${item.section}" data-element-id="${item.id}">
                        <div class="search-result-title">${highlightedTitle}</div>
                        <div class="search-result-path">${item.sectionTitle}</div>
                        ${item.description ? `<div class="search-result-description">${highlightedDescription}</div>` : ''}
                    </div>
                `;
            }).join('');

            // 绑定结果点击事件
            this.bindResultEvents();
        }

        this.showResults();
    }

    /**
     * 高亮文本
     */
    highlightText(text, query) {
        if (!text || !query) return text;
        
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<span class="search-highlight">$1</span>');
    }

    /**
     * 绑定搜索结果事件
     */
    bindResultEvents() {
        const resultItems = this.searchResults.querySelectorAll('.search-result-item');
        
        resultItems.forEach(item => {
            item.addEventListener('click', () => {
                const sectionId = item.dataset.section;
                const elementId = item.dataset.elementId;
                this.navigateToSetting(sectionId, elementId);
            });
        });
    }

    /**
     * 导航到设置项
     */
    navigateToSetting(sectionId, elementId) {
        // 隐藏搜索结果
        this.hideResults();
        this.clearSearch();

        // 切换到对应的节
        const targetSection = sectionId.replace('-section', '');
        const navItem = document.querySelector(`[data-section="${targetSection}"]`);
        
        if (navItem) {
            // 触发导航点击
            navItem.click();
            
            // 等待切换动画完成后滚动到目标元素
            setTimeout(() => {
                if (elementId) {
                    const targetElement = document.getElementById(elementId);
                    if (targetElement) {
                        const settingItem = targetElement.closest('.setting-item');
                        if (settingItem) {
                            // 滚动到元素
                            settingItem.scrollIntoView({ 
                                behavior: 'smooth', 
                                block: 'center' 
                            });
                            
                            // 高亮显示
                            this.highlightElement(settingItem);
                        }
                    }
                }
            }, 300);
        }
    }

    /**
     * 高亮显示元素
     */
    highlightElement(element) {
        // 添加高亮类
        element.classList.add('setting-highlight');
        
        // 3秒后移除高亮
        setTimeout(() => {
            element.classList.remove('setting-highlight');
        }, 3000);
    }

    /**
     * 处理键盘事件
     */
    handleKeydown(e) {
        const resultItems = this.searchResults.querySelectorAll('.search-result-item');
        
        if (e.key === 'Escape') {
            this.hideResults();
            this.searchInput.blur();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            this.navigateResults(e.key === 'ArrowDown' ? 1 : -1, resultItems);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const activeResult = this.searchResults.querySelector('.search-result-item.active');
            if (activeResult) {
                activeResult.click();
            } else if (resultItems.length > 0) {
                resultItems[0].click();
            }
        }
    }

    /**
     * 键盘导航搜索结果
     */
    navigateResults(direction, resultItems) {
        if (resultItems.length === 0) return;

        const currentActive = this.searchResults.querySelector('.search-result-item.active');
        let newIndex = 0;

        if (currentActive) {
            const currentIndex = Array.from(resultItems).indexOf(currentActive);
            newIndex = currentIndex + direction;
            currentActive.classList.remove('active');
        }

        // 循环导航
        if (newIndex < 0) newIndex = resultItems.length - 1;
        if (newIndex >= resultItems.length) newIndex = 0;

        resultItems[newIndex].classList.add('active');
        resultItems[newIndex].scrollIntoView({ block: 'nearest' });
    }

    /**
     * 显示搜索结果
     */
    showResults() {
        this.searchResults.style.display = 'block';
    }

    /**
     * 隐藏搜索结果
     */
    hideResults() {
        this.searchResults.style.display = 'none';
        // 清除活动状态
        const activeResult = this.searchResults.querySelector('.search-result-item.active');
        if (activeResult) {
            activeResult.classList.remove('active');
        }
    }

    /**
     * 清空搜索
     */
    clearSearch() {
        this.searchInput.value = '';
        this.searchClear.style.display = 'none';
        this.hideResults();
    }

    /**
     * 重新构建索引（用于动态内容更新）
     */
    rebuildIndex() {
        if (this.isInitialized) {
            this.buildSearchIndex();
        }
    }
}

// 创建全局实例
const settingsSearch = new SettingsSearch();

// 导出实例和类
export { settingsSearch, SettingsSearch };
