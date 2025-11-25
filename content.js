class CtrlSpaceHelper {
    constructor() {
        this.helperHost = null;
        this.shadowRoot = null;
        this.helperDiv = null;
        this.isVisible = false;
        this.currentInput = null;
        this.settings = {
            enableHelper: true,
            position: 'cursor'
        };
        this.templates = [];
        
        this.init();
    }

    init() {
        this.createShadowHost();
        this.injectStyles();
        this.createHelperDiv();
        this.bindEvents();
        this.loadSettingsAndTemplates();
    }

    createShadowHost() {
        this.helperHost = document.createElement('div');
        this.helperHost.id = 'text-shortcuts-host';
        this.helperHost.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            z-index: 2147483647;
            pointer-events: none;
        `;
        
        this.shadowRoot = this.helperHost.attachShadow({ mode: 'closed' });
        document.body.appendChild(this.helperHost);
    }

    injectStyles() {
        const style = document.createElement('style');

        style.textContent = `@import url("${chrome.runtime.getURL('styles.css')}");`;

        this.shadowRoot.appendChild(style);
    }

    createHelperDiv() {
        this.helperDiv = document.createElement('div');
        this.helperDiv.className = 'tt-dropdown-container';
        this.helperDiv.innerHTML = `
            <div class="content">
                <label class="search">
                    <span>🔍</span>
                    <input type="text">
                </label>

                <div class="templates-list" id="templatesList"></div>
            </div>
        `;
        
        this.shadowRoot.appendChild(this.helperDiv);
    }

    async loadSettingsAndTemplates() {
        // const settingsResult = await chrome.storage.local.get({
        //     enableHelper: true,
        //     position: 'cursor'
        // });
        // this.settings = settingsResult;

        const templatesResult = await chrome.storage.local.get({ 
            templates: []
        });
        
        this.templates = templatesResult.templates || [];
        this.renderTemplates();
    }

    renderTemplates(templates = this.templates) {
        const templatesList = this.shadowRoot.querySelector('#templatesList');

        templatesList.innerHTML = templates.length > 0 ? templates.map((template, index) => {
            return `
                <div class="template-item" data-index="${index}" data-id="${template.id}">
                    <div class="header">
                        <div class="name">${template?.name || 'Unnamed'}</div>
                    </div>

                    ${template.description ? `<div class="description">${template?.description}</div>` : ''}

                    ${template.tags && template.tags.length > 0 ? `
                        <div class="tags">
                            ${template.tags.map(tag => `<div>${tag}</div>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('') : `
            <div class="empty-state">
                <p>No snippets yet</p>
                <small>Create your first snippet in the popup</small>
            </div>
        `;

        // Добавляем обработчики клика
        templatesList.querySelectorAll('.template-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);

                this.selectTemplate(index);
            });
        });
    }

    getTemplatePreview(template) {
        try {
        // Для HTML показываем очищенный текст
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = template.html || template.text || '';
        const text = tempDiv.textContent || '';
        return this.escapeHtml(text.substring(0, 100) + (text.length > 100 ? '...' : ''));
        } catch (error) {
        console.error('Ошибка при создании preview:', error);
        return 'Ошибка при загрузке шаблона';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    bindEvents() {
        // Обработчик нажатия клавиш для открытия меню
        document.addEventListener('keydown', (e) => {
            if (!this.settings.enableHelper) return;
            
            if (e.ctrlKey && e.code === 'Space') {
                e.preventDefault();
                e.stopPropagation();
                
                const activeElement = document.activeElement;
                const isTextInput = this.isTextInput(activeElement);
                
                if (isTextInput) {
                    this.currentInput = activeElement;
                    this.showHelper();
                }
            }
            
            // Обработка клавиш когда меню открыто
            if (this.isVisible) {
                this.handleMenuKeydown(e);
            }
        });

        // Закрытие при клике вне helper
        document.addEventListener('click', (e) => {
            if (this.isVisible && !this.helperHost.contains(e.target)) {
                this.hideHelper();
            }
        });

        // Обновляем позицию при скролле
        document.addEventListener('scroll', () => {
            if (this.isVisible) {
                this.updatePosition();
            }
        }, true);

        // Обновляем позицию при ресайзе
        window.addEventListener('resize', () => {
            if (this.isVisible) {
                this.updatePosition();
            }
        });

        // Обновляем позицию при вводе текста
        document.addEventListener('input', (e) => {
            if (this.isVisible && this.currentInput) {
                setTimeout(() => {
                    this.updatePosition();
                }, 0);
            }
        });

        // Обработчик сообщений от background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('Message received in content script:', message);
            
            switch (message.action) {
                case "saveSelectionAsTemplate":
                    this.saveSelectionAsTemplate();
                    break;
                
                case "transformSelection":
                    this.transformSelection(message.transformation, message.selectedText);
                    break;
                
                case "refreshTemplates":
                    this.loadSettingsAndTemplates();
                    break;
                
                case "updateSettings":
                    this.settings = { ...this.settings, ...message.settings };
                    break;
            }
        });
    }

    /**
     * @param { KeyboardEvent } e 
    */
    handleMenuKeydown(e) {
        const items = this.helperDiv.querySelectorAll('.template-item');

        // if (items.length === 0) return;

        let currentId = -1;
        let currentIndex = -1;

        items.forEach((item, index) => {
            if (item.classList.contains('selected')) {
                currentId = item.getAttribute('data-id');
                currentIndex = index;
            }
        });

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
                this.selectTemplateItem(items, nextIndex);
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
                this.selectTemplateItem(items, prevIndex);
                break;
                
            case 'Enter':
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (currentIndex !== -1) {
                    this.selectTemplate(currentId);
                } else {
                    this.selectTemplateItem(items, 0);
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.hideHelper();
                break;
                
            case 'Tab':
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                break;

            // case 'Backspace':
            //     // e.preventDefault();
            //     // e.stopPropagation();
            //     this.handleBackspace();
            //     break;

            default:
                // if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                //     this.handleTextInput(e.key);
                // }
                break;
        }
    }

    handleTextInput(char) {
        // const searchInput = this.shadowRoot.querySelector('.search span');
        
        // // Добавляем символ в поле поиска
        // searchInput.textContent += char;
        
        // // Фильтруем шаблоны
        // // this.filterTemplates(searchInput.value);
        // const r = new RegExp(searchInput.textContent, 'gi');

        // this.renderTemplates([...this.templates].filter(t => {
        //     return r.test(t?.name) || r.test(t?.description) || r.test(t?.shortcut) || r.test(t?.text) || (t?.tags && t?.tags?.some(tag => r.test(tag)));
        // }));
        
        // // Авто-выбор первого элемента после фильтрации
        // setTimeout(() => {
        //     const firstItem = this.shadowRoot.querySelector('.template-item');
        //     if (firstItem) {
        //         firstItem.classList.add('selected');
        //     }
        // }, 0);
    }

    handleBackspace() {
        // const searchInput = this.shadowRoot.querySelector('.search span');
        
        // if (searchInput.textContent.length > 0) {
        //     // Удаляем последний символ
        //     searchInput.textContent = searchInput.textContent.slice(0, -1);
            
        //     // Фильтруем шаблоны с обновленным запросом
        //     // this.filterTemplates(searchInput.value);
        //     const r = new RegExp(searchInput.textContent, 'gi');

        //     this.renderTemplates([...this.templates].filter(t => {
        //         return r.test(t?.name) || r.test(t?.description) || r.test(t?.shortcut) || r.test(t?.text) || (t?.tags && t?.tags?.some(tag => r.test(tag)));
        //     }));
            
        //     // Авто-выбор первого элемента после фильтрации
        //     setTimeout(() => {
        //         const firstItem = this.shadowRoot.querySelector('.template-item');
        //         if (firstItem) {
        //             firstItem.classList.add('selected');
        //         }
        //     }, 0);
        // } else {
        //     // Если строка поиска пустая, скрываем меню
        //     this.hideHelper();
        // }
    }

    selectTemplateItem(items, index) {
        items.forEach(item => item.classList.remove('selected'));
        if (items[index]) {
        items[index].classList.add('selected');
        items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    async saveSelectionAsTemplate() {
        console.log('saveSelectionAsTemplate called');
        
        const selection = window.getSelection();
            if (!selection || selection.toString().trim().length === 0) {
            this.showNotification('Выделите текст для сохранения как шаблон', 'error');
            return;
        }

        try {
            const selectedText = selection.toString().trim();
            const selectedHtml = this.getSelectedHtml(selection);
            
            console.log('Saving template:', { selectedText, selectedHtml });
            
            // Создаем базовый шаблон с выделенным текстом
            const template = {
                id: Date.now().toString(),
                name: `Template ${new Date().toLocaleDateString()}`,
                shortcut: `temp_${Date.now()}`,
                description: '',
                text: selectedText,
                html: selectedHtml,
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                hasStyle: this.hasFormatting(selectedHtml)
            };

            // Сохраняем в хранилище
            const result = await chrome.storage.local.get({ templates: [] });
            const templates = result.templates || [];
            templates.unshift(template);
            
            await chrome.storage.local.set({ templates });
            
            // Обновляем список шаблонов
            await this.loadSettingsAndTemplates();
            this.showNotification('Шаблон успешно сохранен из выделенного текста!', 'success');
        } catch (error) {
            console.error('Ошибка при сохранении шаблона:', error);
            this.showNotification('Ошибка при сохранении шаблона: ' + error.message, 'error');
        }
    }

    getSelectedHtml(selection) {
        if (selection.rangeCount === 0) return '';
        
        try {
        const range = selection.getRangeAt(0);
        const container = document.createElement('div');
        
        // Клонируем содержимое с сохранением форматирования
        const clonedContent = range.cloneContents();
        container.appendChild(clonedContent);
        
        return container.innerHTML;
        } catch (error) {
        console.error('Ошибка при получении HTML выделения:', error);
        return '';
        }
    }

    hasFormatting(html) {
        if (!html || html.trim() === '') return false;
        
        try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // Проверяем наличие HTML тегов (кроме BR)
        const elements = tempDiv.querySelectorAll('*');
        
        for (let element of elements) {
            const tagName = element.tagName.toLowerCase();
            
            // Игнорируем простые теги
            if (tagName === 'br') continue;
            
            // Если есть любой другой тег - есть форматирование
            if (tagName !== 'div' && tagName !== 'p' && tagName !== 'span') return true;
            
            // Проверяем стили
            const style = element.style;
            if (style.fontWeight || 
                style.fontStyle || 
                style.textDecoration ||
                style.color ||
                style.backgroundColor ||
                style.fontSize ||
                style.fontFamily ||
                style.textAlign) {
            return true;
            }
            
            // Проверяем классы и атрибуты
            if (element.className && element.className.length > 0) {
            return true;
            }
            
            if (element.getAttribute('style')) {
            return true;
            }
        }
        
        return false;
        } catch (error) {
        console.error('Ошибка при проверке форматирования:', error);
        return false;
        }
    }

    transformSelection(transformation, selectedText) {
        if (!selectedText) return;

        try {
        let transformedText = String(selectedText);
        
        switch (transformation) {
            case 'upperCase':
            transformedText = transformedText.toUpperCase();
            break;
            case 'lowerCase':
            transformedText = transformedText.toLowerCase();
            break;
        }
        
        // Заменяем выделенный текст
        this.replaceSelectedText(transformedText);
        this.showNotification('Текст преобразован', 'success');
        
        } catch (error) {
        console.error('Ошибка при преобразовании текста:', error);
        this.showNotification('Ошибка при преобразовании текста', 'error');
        }
    }

    replaceSelectedText(newText) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(newText));
    }

    selectTemplate(templateId) {
        const template = this.templates.find(t => t.id === templateId);
        if (template && this.currentInput) {
            this.insertTemplate(template);
            this.hideHelper();
        }
    }

    setCursorAtPosition(element, position) {
        const range = document.createRange();
        const selection = window.getSelection();
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);

        let currentNode;
        let currentPosition = 0;

        // Находим нужный текстовый узел и позицию внутри него
        while (currentNode = walker.nextNode()) {
            const nodeLength = currentNode.nodeValue.length;

            // Проверяем, попадает ли искомая позиция в текущий узел
            if (currentPosition + nodeLength >= position) {
                // Устанавливаем диапазон на найденный узел и позицию
                range.setStart(currentNode, position - currentPosition);
                range.collapse(true); // Установка курсора
                break;
            }
            
            currentPosition += nodeLength;
        }

        // Если найден узел и диапазон, устанавливаем курсор
        if (selection.rangeCount > 0) {
            selection.removeAllRanges();
        }
        selection.addRange(range);
    }

    insertTemplate(template) {
        if (!this.currentInput) return;
        
        try {
            if (this.aaa > 0) this.setCursorAtPosition(this.currentInput, this.aaa);
            else this.currentInput?.focus();
            
            // Всегда пытаемся вставить HTML с форматированием
            if (template.html && this.currentInput.isContentEditable) {
                this.insertHtml(template.html);
            } else {
                // Fallback: вставляем чистый текст
                this.insertText(template.text || template.html);
            }
        } catch (error) {
            console.error('Ошибка при вставке шаблона:', error);
            // Fallback: вставляем как простой текст
            this.insertText(template.text || template.html);
        }
    }

    insertText(text) {
        if (!this.currentInput) return;
        
        try {
        const textStr = String(text || '');
        
        if (this.currentInput.tagName.toLowerCase() === 'input' || 
            this.currentInput.tagName.toLowerCase() === 'textarea') {
            const start = this.currentInput.selectionStart;
            const end = this.currentInput.selectionEnd;
            const value = this.currentInput.value;
            
            this.currentInput.value = value.substring(0, start) + textStr + value.substring(end);
            this.currentInput.selectionStart = this.currentInput.selectionEnd = start + textStr.length;
            
            this.currentInput.dispatchEvent(new Event('input', { bubbles: true }));
            this.currentInput.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (this.currentInput.isContentEditable) {
            document.execCommand('insertText', false, textStr);
            this.currentInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        this.currentInput.focus();
        } catch (error) {
        console.error('Ошибка при вставке текста:', error);
        this.showNotification('Ошибка при вставке текста', 'error');
        }
    }

    insertHtml(html) {
        if (!this.currentInput || !this.currentInput.isContentEditable) return;
        
        try {
        const htmlStr = String(html || '');
        
        // Для contenteditable вставляем HTML с форматированием
        document.execCommand('insertHTML', false, htmlStr);
        this.currentInput.dispatchEvent(new Event('input', { bubbles: true }));
        this.currentInput.focus();
        
        } catch (error) {
        console.error('Ошибка при вставке HTML:', error);
        // Fallback: вставляем как простой текст
        this.insertText(htmlStr);
        }
    }

    aaa = 0;

    showHelper() {
        if (!this.helperDiv) return;
        
        this.isVisible = true;
        this.helperDiv.style.display = 'block';
        this.updatePosition();

        this.loadSettingsAndTemplates();
        
        // Авто-выбор первого шаблона
        setTimeout(() => {
            const firstItem = this.helperDiv.querySelector('.template-item');

            if (firstItem) {
                firstItem.classList.add('selected');
            }
        }, 0);
        
        // Фокус на input после показа helper
        setTimeout(() => {
            if (this.currentInput) {
                const selection = window.getSelection();
                
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const preCaretRange = range.cloneRange();
                    preCaretRange.selectNodeContents(this.currentInput);
                    preCaretRange.setEnd(range.endContainer, range.endOffset);
                    const position = preCaretRange.toString().length;
                    console.log(this.currentInput, position)
                    this.aaa = position;
                }
                let a = this.helperDiv.querySelector('.search input');


                a.focus();

                a.addEventListener('input', e => {
                    const r = new RegExp(e.target.value, 'gi');

                    this.renderTemplates([...this.templates].filter(t => {
                        return r.test(t?.name) || r.test(t?.description) || r.test(t?.shortcut) || r.test(t?.text) || (t?.tags && t?.tags?.some(tag => r.test(tag)));
                    }));
                    
                    setTimeout(() => {
                        const firstItem = this.shadowRoot.querySelector('.template-item');

                        if (firstItem) {
                            firstItem.classList.add('selected');
                        }
                    }, 0);
                });
            }
        }, 0);
    }

    hideHelper() {
        if (!this.helperDiv) return;
        
        this.isVisible = false;
        this.helperDiv.style.display = 'none';
        // this.helperDiv.querySelector('.search span').textContent = '';
        this.helperDiv.querySelector('.search input').value = '';
        this.currentInput?.focus();
        this.currentInput = null;
    }

    isTextInput(element) {
        if (!element) return false;
        
        const tagName = element.tagName.toLowerCase();
        const type = element.type ? element.type.toLowerCase() : '';
        
        const textInputTypes = [
        'text', 'textarea', 'password', 'email', 'search', 'url', 'number'
        ];
        
        return (
        (tagName === 'input' && textInputTypes.includes(type)) ||
        tagName === 'textarea' ||
        element.isContentEditable
        );
    }

    getCursorPosition(input) {
        if (!input) return { x: 0, y: 0 };
        
        if (input.tagName.toLowerCase() === 'input' || input.tagName.toLowerCase() === 'textarea') {
        return this.getInputCursorPosition(input);
        }
        
        if (input.isContentEditable) {
        return this.getContentEditableCursorPosition(input);
        }
        
        return { x: 0, y: 0 };
    }

    getInputCursorPosition(input) {
        const div = document.createElement('div');
        const style = div.style;
        style.position = 'absolute';
        style.visibility = 'hidden';
        style.whiteSpace = 'pre-wrap';
        style.font = getComputedStyle(input).font;
        style.left = '-9999px';
        style.top = '-9999px';
        
        document.body.appendChild(div);
        
        const text = input.value.substring(0, input.selectionStart);
        div.textContent = text;
        
        if (!text) {
        div.textContent = ' ';
        }
        
        const rect = input.getBoundingClientRect();
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        
        let cursorX = div.offsetWidth;
        let cursorY = 0;
        
        if (input.tagName.toLowerCase() === 'textarea') {
        const lines = text.split('\n');
        const currentLine = lines[lines.length - 1];
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = style.cssText;
        tempDiv.textContent = currentLine || ' ';
        document.body.appendChild(tempDiv);
        
        cursorY = (lines.length - 1) * parseInt(getComputedStyle(input).lineHeight);
        document.body.removeChild(tempDiv);
        }
        
        document.body.removeChild(div);
        
        return {
        x: rect.left + cursorX + scrollX,
        y: rect.top + cursorY + scrollY
        };
    }

    getContentEditableCursorPosition(element) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return { x: 0, y: 0 };
        
        const range = selection.getRangeAt(0).cloneRange();
        const rect = range.getBoundingClientRect();
        
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        
        if (rect.width === 0 && rect.height === 0) {
        const elementRect = element.getBoundingClientRect();
        return {
            x: elementRect.left + scrollX,
            y: elementRect.top + scrollY
        };
        }
        
        return {
        x: rect.left + scrollX,
        y: rect.bottom + scrollY
        };
    }

    updatePosition() {
        if (!this.isVisible || !this.currentInput) return;
        
        const cursorPos = this.getCursorPosition(this.currentInput);
        
        this.helperHost.style.left = cursorPos.x + 'px';
        this.helperHost.style.top = (cursorPos.y + 42) + 'px';
        
        this.adjustToViewport();
    }

    adjustToViewport() {
        const helperRect = this.helperDiv.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let newLeft = parseInt(this.helperHost.style.left);
        let newTop = parseInt(this.helperHost.style.top);
        
        if (helperRect.right > viewportWidth) {
            newLeft = viewportWidth - helperRect.width - 10;
        }
        
        if (helperRect.left < 0) {
            newLeft = 10;
        }
        
        if (helperRect.bottom > viewportHeight) {
            newTop = viewportHeight - helperRect.height - 10;
        }
        
        if (helperRect.top < 0) {
            newTop = 10;
        }
        
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        
        this.helperHost.style.left = (newLeft + scrollX) + 'px';
        this.helperHost.style.top = (newTop + scrollY) + 'px';
    }

    showNotification(message, type = 'info') {
        // Создаем уведомление в Shadow DOM
        const notification = document.createElement('div');
        notification.className = `template-notification ${type === 'error' ? 'error' : ''}`;
        notification.textContent = message;
        
        this.shadowRoot.appendChild(notification);
        
        // Автоматически удаляем через 3 секунды
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    handleMessage(message) {
        switch (message.action) {
        case 'updateSettings':
            this.settings = { ...this.settings, ...message.settings };
            break;
        case 'insertText':
            this.insertText(message.text);
            break;
        case 'refreshTemplates':
            this.loadSettingsAndTemplates();
            break;
        }
    }
}

// Инициализация
let helperInstance = null;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        helperInstance = new CtrlSpaceHelper();
    });
} else {
    helperInstance = new CtrlSpaceHelper();
}

// Обработчик сообщений от popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (helperInstance) {
        helperInstance.handleMessage(message);
    }
});