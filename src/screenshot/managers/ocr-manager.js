/**
 * OCR管理模块
 * 负责识别截图区域中的文字
 */

import Tesseract from 'tesseract.js';

export class OCRManager {
    constructor() {
        this.worker = null;
        this.isInitialized = false;
        this.isProcessing = false;
        this.supportedLanguages = ['eng', 'chi_sim']; // 英文和简体中文
    }

    /**
     * 初始化OCR Worker (Tesseract.js v6 API)
     */
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            // v6 API: 创建 Worker，优先使用中文语言包
            this.worker = await Tesseract.createWorker('chi_sim+eng', 1, {
                errorHandler: err => console.error('OCR错误:', err)
            });
            
            // 设置参数提高识别准确率
            await this.worker.setParameters({
                tessedit_pageseg_mode: '3',
                preserve_interword_spaces: '1',
            });
            
            this.isInitialized = true;
        } catch (error) {
            console.error('OCR Worker 初始化失败:', error);
            throw error;
        }
    }

    /**
     * 识别图像中的文字
     * @param {HTMLCanvasElement|ImageData|string} image - 图像源
     * @returns {Promise<string>} 识别出的文字
     */
    async recognize(image) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.isProcessing) {
            console.warn('OCR正在处理中，请稍候...');
            return '';
        }

        try {
            this.isProcessing = true;
            const { data } = await this.worker.recognize(image);
            return data.text.trim();
        } catch (error) {
            console.error('OCR识别失败:', error);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 识别选区内的文字（带位置信息）
     * @param {HTMLCanvasElement} backgroundCanvas - 背景画布
     * @param {Object} selection - 选区信息 {left, top, width, height}
     * @returns {Promise<Object>} 识别结果 {text, lines, words}
     */
    async recognizeSelection(backgroundCanvas, selection) {
        if (!selection || !backgroundCanvas) {
            throw new Error('缺少必要参数');
        }

        // 创建临时画布，提取选区图像
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        
        // 将选区尺寸转换为画布实际尺寸
        const rect = backgroundCanvas.getBoundingClientRect();
        const scaleX = backgroundCanvas.width / rect.width;
        const scaleY = backgroundCanvas.height / rect.height;
        
        const canvasX = Math.floor(selection.left * scaleX);
        const canvasY = Math.floor(selection.top * scaleY);
        const canvasWidth = Math.floor(selection.width * scaleX);
        const canvasHeight = Math.floor(selection.height * scaleY);
        
        tempCanvas.width = canvasWidth;
        tempCanvas.height = canvasHeight;
        
        // 绘制选区内容
        ctx.drawImage(
            backgroundCanvas,
            canvasX, canvasY, canvasWidth, canvasHeight,
            0, 0, canvasWidth, canvasHeight
        );
        
        // 图像预处理：增强对比度和清晰度
        this.enhanceImageForOCR(ctx, canvasWidth, canvasHeight);
        
        // 识别文字（获取完整数据）
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.isProcessing) {
            console.warn('OCR正在处理中，请稍候...');
            return { text: '', lines: [], words: [] };
        }

        try {
            this.isProcessing = true;
            
            // 关键：在 recognize() 时明确指定输出格式（v6 API）
            const result = await this.worker.recognize(tempCanvas, {}, {
                blocks: true,
                text: true
            });
            const data = result.data;
            
            // 从 blocks 层级结构提取行和词的位置信息
            const lines = [];
            const words = [];
            
            if (data.blocks) {
                data.blocks.forEach(block => {
                    if (block.paragraphs) {
                        block.paragraphs.forEach(paragraph => {
                            if (paragraph.lines) {
                                paragraph.lines.forEach(line => {
                                    lines.push({
                                        text: line.text,
                                        bbox: line.bbox,
                                        confidence: line.confidence
                                    });
                                    
                                    if (line.words) {
                                        line.words.forEach(word => {
                                            words.push({
                                                text: word.text,
                                                bbox: word.bbox,
                                                confidence: word.confidence
                                            });
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
            
            return {
                text: (data.text || '').trim(),
                lines,
                words,
                selection: {
                    left: selection.left,
                    top: selection.top,
                    width: selection.width,
                    height: selection.height
                },
                canvasSize: {
                    width: canvasWidth,
                    height: canvasHeight
                }
            };
        } catch (error) {
            console.error('OCR识别失败:', error);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 在原图上显示OCR文字覆盖层
     * @param {Object} result - OCR识别结果
     */
    showOverlayResult(result) {
        if (!result || !result.lines || result.lines.length === 0) {
            this.showNotification('未识别到文字', 'warning');
            return;
        }

        // 创建或获取覆盖层容器
        let overlay = document.getElementById('ocrOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ocrOverlay';
            overlay.className = 'ocr-overlay';
            document.body.appendChild(overlay);
        } else {
            overlay.innerHTML = ''; // 清空之前的内容
        }

        // 为每一行创建文字覆盖元素
        result.lines.forEach((line, index) => {
            const lineElement = document.createElement('div');
            lineElement.className = 'ocr-text-line';
            lineElement.textContent = line.text;
            lineElement.setAttribute('data-line-index', index);
            
            // 计算位置：bbox 是物理像素坐标，需要转换为 CSS 像素坐标
            const { selection, canvasSize } = result;
            
            // bbox 坐标相对于 tempCanvas（物理像素），转换为相对于选区的 CSS 坐标
            const scaleX = selection.width / canvasSize.width;
            const scaleY = selection.height / canvasSize.height;
            
            const left = selection.left + line.bbox.x0 * scaleX;
            const top = selection.top + line.bbox.y0 * scaleY;
            const width = (line.bbox.x1 - line.bbox.x0) * scaleX;
            const height = (line.bbox.y1 - line.bbox.y0) * scaleY;
            
            lineElement.style.left = `${left}px`;
            lineElement.style.top = `${top}px`;
            lineElement.style.height = `${height}px`;
            
            // 精确匹配字体大小
            const fontSize = height * 0.90;
            lineElement.style.fontSize = `${fontSize}px`;
            lineElement.style.lineHeight = `${height}px`;
            
            // 计算理想的文字宽度（不设置固定宽度，使用 transform scale）
            const textLength = line.text.length;
            if (textLength > 0) {
                // 创建临时元素测量实际文字宽度
                const tempSpan = document.createElement('span');
                tempSpan.style.cssText = `
                    position: absolute;
                    visibility: hidden;
                    font-size: ${fontSize}px;
                    font-family: ${window.getComputedStyle(lineElement).fontFamily};
                    white-space: nowrap;
                `;
                tempSpan.textContent = line.text;
                document.body.appendChild(tempSpan);
                const naturalWidth = tempSpan.offsetWidth;
                document.body.removeChild(tempSpan);
                
                // 计算缩放比例，使文字精确匹配 bbox 宽度
                const scaleX = width / naturalWidth;
                if (scaleX > 0.7 && scaleX < 1.3) {  // 合理范围内缩放
                    lineElement.style.transform = `scaleX(${scaleX})`;
                    lineElement.style.transformOrigin = 'left center';
                    lineElement.style.width = `${naturalWidth}px`;
                } else {
                    // 如果缩放比例过大/过小，使用字间距调整
                    lineElement.style.width = `${width}px`;
                    const letterSpacing = (width - naturalWidth) / Math.max(textLength - 1, 1);
                    if (Math.abs(letterSpacing) < fontSize * 0.3) {
                        lineElement.style.letterSpacing = `${letterSpacing}px`;
                    }
                }
            } else {
                lineElement.style.width = `${width}px`;
            }
            
            overlay.appendChild(lineElement);
        });
    }

    /**
     * 复制 OCR 识别的文字
     */
    async copyText() {
        const overlay = document.getElementById('ocrOverlay');
        if (!overlay) {
            this.showNotification('没有可复制的文字', 'warning');
            return;
        }

        try {
            // 优先复制用户选中的文本，否则复制全部
            const selection = window.getSelection();
            let textToCopy = selection.toString().trim();
            
            if (!textToCopy) {
                // 如果没有选中文字，复制全部
                const lines = overlay.querySelectorAll('.ocr-text-line');
                textToCopy = Array.from(lines).map(line => line.textContent).join('\n');
            }
            
            await navigator.clipboard.writeText(textToCopy);
            this.showNotification('已复制到剪贴板', 'info');
        } catch (err) {
            console.error('复制失败:', err);
            this.showNotification('复制失败', 'error');
        }
    }

    /**
     * 显示加载提示
     */
    showLoadingDialog() {
        const loading = document.createElement('div');
        loading.className = 'ocr-loading-dialog';
        loading.id = 'ocrLoadingDialog';
        loading.innerHTML = `
            <div class="ocr-loading-content">
                <div class="ocr-loading-spinner"></div>
                <div class="ocr-loading-text">正在识别文字...</div>
            </div>
        `;
        document.body.appendChild(loading);
    }

    /**
     * 隐藏加载提示
     */
    hideLoadingDialog() {
        const loading = document.getElementById('ocrLoadingDialog');
        if (loading) {
            loading.remove();
        }
    }

    /**
     * 显示通知消息
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `ocr-notification ocr-notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // 自动消失
        setTimeout(() => {
            notification.classList.add('ocr-notification-fade');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * 图像预处理：增强对比度，提高OCR识别率
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {number} width - 图像宽度
     * @param {number} height - 图像高度
     */
    enhanceImageForOCR(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // 计算亮度和对比度增强因子
        const contrast = 1.2;  // 对比度增强 20%
        const brightness = 10; // 亮度增加 10
        
        for (let i = 0; i < data.length; i += 4) {
            // 增强对比度和亮度
            data[i] = Math.min(255, Math.max(0, contrast * (data[i] - 128) + 128 + brightness));     // R
            data[i + 1] = Math.min(255, Math.max(0, contrast * (data[i + 1] - 128) + 128 + brightness)); // G
            data[i + 2] = Math.min(255, Math.max(0, contrast * (data[i + 2] - 128) + 128 + brightness)); // B
        }
        
        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * 清理 OCR 界面元素
     */
    clear() {
        // 移除 OCR 覆盖层
        const overlay = document.getElementById('ocrOverlay');
        if (overlay) {
            overlay.remove();
        }
        
        // 移除加载对话框
        const loading = document.getElementById('ocrLoadingDialog');
        if (loading) {
            loading.remove();
        }
        
        // 移除所有通知
        const notifications = document.querySelectorAll('.ocr-notification');
        notifications.forEach(notification => notification.remove());
    }

    /**
     * 清理资源
     */
    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            this.isInitialized = false;
        }
    }
}
