let currentTags = [];
let editingIndex = -1;
let currentEditTags = [];
let editingTemplateId = null;

// Загрузка данных
document.addEventListener('DOMContentLoaded', async () => {
  await loadTemplates();
  bindEvents();
  updateSnippetsCount();
  loadTagFilter();
});

async function loadTemplates() {
  const result = await chrome.storage.sync.get({
    templates: []
  });
  
  renderTemplates(result.templates);
}

function bindEvents() {
  // Save snippet
  document.getElementById('saveSnippet').addEventListener('click', saveSnippet);
  document.getElementById('cancelEdit').addEventListener('click', cancelEdit);
  
  // Tags input
  document.getElementById('editTags').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tag = e.target.value.trim();
      if (tag && !currentEditTags.includes(tag)) {
        currentEditTags.push(tag);
        console.log(`Added tag 1`, tag)
        renderTags();
        e.target.value = '';
      }
    }
  });

  // Filter
  document.getElementById('filterTags').addEventListener('change', loadTemplates);

  // Modal controls
  document.getElementById('searchBtn').addEventListener('click', () => {
    document.getElementById('searchModal').classList.add('active');
    document.getElementById('searchInput').focus();
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    document.getElementById('exportModal').classList.add('active');
    showExportData();
  });

  document.getElementById('closeSearch').addEventListener('click', () => {
    document.getElementById('searchModal').classList.remove('active');
  });

  document.getElementById('closeExport').addEventListener('click', () => {
    document.getElementById('exportModal').classList.remove('active');
  });

  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', handleImport);

  // Search functionality
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchTemplates(e.target.value);
  });

  // Footer buttons

  document.getElementById('closeEdit').addEventListener('click', closeEditModal);
  document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('saveEdit').addEventListener('click', saveTemplateEdit);
  document.getElementById('deleteTemplate').addEventListener('click', deleteCurrentTemplate);
  
  // Edit tags input
  document.getElementById('editTags').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tag = e.target.value.trim();
      if (tag && !currentEditTags.includes(tag)) {
        currentEditTags.push(tag);
        console.log('Added tag 2', tag)
        renderEditTags();
        e.target.value = '';
      }
    }
  });
}

function renderTags() {
  const tagsList = document.getElementById('editTagsList');
  
  tagsList.innerHTML = '';

  currentEditTags.forEach((t, index) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    
    tag.innerHTML = `${escapeHtml(t)}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-remove';
    btn.innerHTML = 'x';
    btn.onclick = () => removeTag(index);

    tag.appendChild(btn);

    tagsList.appendChild(tag);
  });
}

function removeTag(index) {
  currentEditTags.splice(index, 1);
  renderTags();
}

async function saveSnippet() {
  const name = document.getElementById('editName').value.trim();
  const shortcut = document.getElementById('editShortcut').value.trim();
  const description = document.getElementById('editDescription').value.trim();
  const text = document.getElementById('editContent').value.trim();

  if (!name || !shortcut || !text) {
    alert('Please fill in required fields: Name, Shortcut, and Content');
    return;
  }

  try {
    const template = {
      id: editingIndex !== -1 ? editingIndex : Date.now().toString(),
      name: name,
      shortcut: shortcut,
      description: description,
      text: text,
      html: text, // For now, we'll use the same text for HTML
      tags: [...currentTags],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hasStyle: text.includes('**') || text.includes('*') // Simple style detection
    };

    const result = await chrome.storage.sync.get({ templates: [] });
    const templates = result.templates || [];
    
    if (editingIndex !== -1) {
      // Update existing template
      const index = templates.findIndex(t => t.id === editingIndex);
      if (index !== -1) {
        templates[index] = template;
      }
    } else {
      // Check if shortcut already exists
      const existingIndex = templates.findIndex(t => t.shortcut === shortcut);
      if (existingIndex !== -1) {
        if (!confirm(`Shortcut "${shortcut}" already exists. Replace it?`)) return;
        templates[existingIndex] = template;
      } else {
        templates.unshift(template);
      }
    }
    
    await chrome.storage.sync.set({ templates });
    
    // Clear form
    clearForm();
    
    // Refresh display
    await loadTemplates();
    updateSnippetsCount();
    loadTagFilter();
    
    // Notify content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, {
      action: 'refreshTemplates'
    });
    
  } catch (error) {
    console.error('Error saving snippet:', error);
    alert('Error saving snippet');
  }
}

function clearForm() {
  document.getElementById('editName').value = '';
  document.getElementById('editShortcut').value = '';
  document.getElementById('editDescription').value = '';
  document.getElementById('editContent').value = '';
  currentTags = [];
  renderTags();
  editingIndex = -1;
  document.getElementById('cancelEdit').style.display = 'none';
  document.getElementById('saveSnippet').textContent = 'Save Snippet';
}

function cancelEdit() {
  clearForm();
}

async function useTemplate(index) {
  const result = await chrome.storage.sync.get({ templates: [] });
  const template = result.templates[index];
  
  if (template) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, {
      action: 'insertText',
      text: template.text
    });
    
    window.close();
  }
}

function renderTemplates(templates) {
  const templatesList = document.getElementById('templatesList');
  const filterValue = document.getElementById('filterTags').value;
  
  // Filter templates by tag if selected
  let filteredTemplates = templates;
  if (filterValue) {
    filteredTemplates = templates.filter(template => 
      template.tags && template.tags.includes(filterValue)
    );
  }
  
  if (filteredTemplates.length === 0) {
    templatesList.innerHTML = `
      <div class="empty-state">
        <p>No snippets found</p>
        <small>${filterValue ? 'Try changing the tag filter' : 'Create your first snippet above'}</small>
      </div>
    `;
    return;
  }

  templatesList.innerHTML = ''

  filteredTemplates.forEach((template, index) => {
    const originalIndex = templates.findIndex(t => t.id === template.id) || index;

    const item = document.createElement('div');
    item.className = 'template-item';
    item.setAttribute('data-index', originalIndex)

    item.innerHTML = `
        <div class="template-content">
          <div class="template-header">
            <div class="template-name">${escapeHtml(template.name || 'Unnamed')}</div>
            <div class="template-shortcut">${template.shortcut || 'no-shortcut'}</div>
          </div>
          ${template.description ? `<div class="template-description">${escapeHtml(template.description)}</div>` : ''}
          <div class="template-text">${escapeHtml(template.text || '')}</div>
          ${template.tags && template.tags.length > 0 ? `
            <div class="template-tags">
              ${template.tags.map(tag => `<span class="template-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="template-actions">
          <button class="template-action-btn edit-btn" title="Edit">✏️</button>
          <button class="template-action-btn delete-btn-small" title="Delete">🗑️</button>
        </div>
    `;

    item.querySelector('.edit-btn').addEventListener('click', () => {
      editTemplate(originalIndex);
    })

    item.querySelector('.delete-btn-small').addEventListener('click', () => {
      deleteTemplate(originalIndex);
    })

    templatesList.append(item);
  });

  // Add click handlers
  templatesList.querySelectorAll('.template-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.template-actions')) {
        const index = parseInt(item.dataset.index);
        useTemplate(index);
      }
    });
  });
}

// Обновите функцию editTemplate (старую переименуйте или замените)
function editTemplate(index) {
  chrome.storage.sync.get({ templates: [] }, (result) => {
    const template = result.templates[index];
    if (template) {
      openEditModal(template);
    }
  });
}

// Обновите функцию deleteTemplate (старую переименуйте или замените)
async function deleteTemplate(index) {
  if (!confirm('Are you sure you want to delete this template?')) return;
  
  const result = await chrome.storage.sync.get({ templates: [] });
  const templates = result.templates || [];
  const templateToDelete = templates[index];
  
  templates.splice(index, 1);
  
  await chrome.storage.sync.set({ templates });
  await loadTemplates();
  updateSnippetsCount();
  loadTagFilter();
  
  // Notify content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, {
    action: 'refreshTemplates'
  });
}

function searchTemplates(query) {
  const searchResults = document.getElementById('searchResults');
  
  if (!query.trim()) {
    searchResults.innerHTML = '<div class="empty-state"><p>Type to search snippets</p></div>';
    return;
  }
  
  chrome.storage.sync.get({ templates: [] }, (result) => {
    const templates = result.templates || [];
    const filtered = templates.filter(template => 
      template.name?.toLowerCase().includes(query.toLowerCase()) ||
      template.shortcut?.toLowerCase().includes(query.toLowerCase()) ||
      template.description?.toLowerCase().includes(query.toLowerCase()) ||
      template.text?.toLowerCase().includes(query.toLowerCase()) ||
      (template.tags && template.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())))
    );
    
    if (filtered.length === 0) {
      searchResults.innerHTML = '<div class="empty-state"><p>No snippets found</p></div>';
      return;
    }
    
    searchResults.innerHTML = filtered.map((template, index) => {
      const originalIndex = templates.findIndex(t => t.id === template.id);
      return `
        <div class="template-item" data-index="${originalIndex}">
          <div class="template-content">
            <div class="template-header">
              <div class="template-name">${escapeHtml(template.name || 'Unnamed')}</div>
              <div class="template-shortcut">${template.shortcut || 'no-shortcut'}</div>
            </div>
            ${template.description ? `<div class="template-description">${escapeHtml(template.description)}</div>` : ''}
            <div class="template-text">${escapeHtml(template.text || '')}</div>
            ${template.tags && template.tags.length > 0 ? `
              <div class="template-tags">
                ${template.tags.map(tag => `<span class="template-tag">${escapeHtml(tag)}</span>`).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers for search results
    searchResults.querySelectorAll('.template-item').forEach(item => {
      item.addEventListener('click', () => {
        useTemplate(parseInt(item.dataset.index));
      });
    });
  });
}

function loadTagFilter() {
  chrome.storage.sync.get({ templates: [] }, (result) => {
    const templates = result.templates || [];
    const allTags = new Set();
    
    templates.forEach(template => {
      if (template.tags) {
        template.tags.forEach(tag => allTags.add(tag));
      }
    });
    
    const filterSelect = document.getElementById('filterTags');
    const currentValue = filterSelect.value;
    
    // Clear existing options except "All tags"
    filterSelect.innerHTML = '<option value="">All tags</option>';
    
    // Add tag options
    Array.from(allTags).sort().forEach(tag => {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tag;
      filterSelect.appendChild(option);
    });
    
    // Restore previous selection
    filterSelect.value = currentValue;
  });
}

async function showExportData() {
  const result = await chrome.storage.sync.get({ templates: [] });
  const exportData = document.getElementById('exportData');
  exportData.value = JSON.stringify(result.templates, null, 2);
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const importedData = JSON.parse(e.target.result);
      
      if (Array.isArray(importedData)) {
        const result = await chrome.storage.sync.get({ templates: [] });
        const templates = result.templates || [];
        
        // Merge templates, avoid duplicates by ID or shortcut
        importedData.forEach(newTemplate => {
          const existingById = templates.findIndex(t => t.id === newTemplate.id);
          const existingByShortcut = templates.findIndex(t => t.shortcut === newTemplate.shortcut);
          
          if (existingById !== -1) {
            templates[existingById] = { ...templates[existingById], ...newTemplate };
          } else if (existingByShortcut !== -1) {
            templates[existingByShortcut] = { ...templates[existingByShortcut], ...newTemplate };
          } else {
            templates.push(newTemplate);
          }
        });
        
        await chrome.storage.sync.set({ templates });
        await loadTemplates();
        updateSnippetsCount();
        loadTagFilter();
        
        alert('Snippets imported successfully!');
        document.getElementById('exportModal').classList.remove('active');
      } else {
        alert('Invalid file format');
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Error importing snippets');
    }
  };
  reader.readAsText(file);
}

function toggleTheme() {
  const body = document.body;
  const isDark = body.classList.toggle('dark-theme');
  document.getElementById('themeToggle').textContent = isDark ? 'Dark mode' : 'Light mode';
}

function showHelp() {
  alert(`Text Shortcuts Help:

• Create snippets with name, shortcut, description, and tags
• Use **bold** and *italic* formatting in content
• Press Ctrl+Space in text fields to insert snippets
• Filter snippets by tags using the dropdown
• Right-click selected text to save as template
• Export/Import your snippets for backup`);
}

function updateSnippetsCount() {
  chrome.storage.sync.get({ templates: [] }, (result) => {
    document.getElementById('snippetsCount').textContent = result.templates.length;
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function openEditModal(template) {
  editingTemplateId = template.id;
  
  // Заполняем форму данными шаблона
  document.getElementById('editName').value = template.name || '';
  document.getElementById('editShortcut').value = template.shortcut || '';
  document.getElementById('editDescription').value = template.description || '';
  document.getElementById('editContent').value = template.html || '';
  
  // Загружаем теги
  currentEditTags = template.tags ? [...template.tags] : [];
  renderEditTags();
  
  // Показываем модальное окно
  document.getElementById('editModal').classList.add('active');
  document.getElementById('editName').focus();
}

// Функция закрытия модального окна редактирования
function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
  editingTemplateId = null;
  currentEditTags = [];
}

// Функция сохранения изменений шаблона
async function saveTemplateEdit() {
  const name = document.getElementById('editName').value.trim();
  const shortcut = document.getElementById('editShortcut').value.trim();
  const description = document.getElementById('editDescription').value.trim();
  const content = document.getElementById('editContent').value.trim();

  if (!name || !shortcut || !content) {
    alert('Please fill in required fields: Name, Shortcut, and Content');
    return;
  }

  try {
    const result = await chrome.storage.sync.get({ templates: [] });
    const templates = result.templates || [];
    
    const templateIndex = templates.findIndex(t => t.id === editingTemplateId);
    if (templateIndex === -1) {
      alert('Template not found');
      return;
    }

    // Обновляем шаблон
    templates[templateIndex] = {
      ...templates[templateIndex],
      name: name,
      shortcut: shortcut,
      description: description,
      // text: content,
      // html: content,
      tags: [...currentEditTags],
      updatedAt: new Date().toISOString()
    };

    await chrome.storage.sync.set({ templates });

    console.log(templates, templateIndex, currentEditTags)
    
    // Обновляем отображение
    await loadTemplates();
    updateSnippetsCount();
    loadTagFilter();
    
    // Закрываем модальное окно
    closeEditModal();
    
    // Уведомляем контент скрипт
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, {
      action: 'refreshTemplates'
    });
    
    alert('Template updated successfully!');
    
  } catch (error) {
    console.error('Error updating template:', error);
    alert('Error updating template');
  }
}

// Функция удаления шаблона
async function deleteCurrentTemplate() {
  if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
    return;
  }

  try {
    const result = await chrome.storage.sync.get({ templates: [] });
    const templates = result.templates || [];
    
    const updatedTemplates = templates.filter(t => t.id !== editingTemplateId);
    await chrome.storage.sync.set({ templates: updatedTemplates });
    
    // Обновляем отображение
    await loadTemplates();
    updateSnippetsCount();
    loadTagFilter();
    
    // Закрываем модальное окно
    closeEditModal();
    
    // Уведомляем контент скрипт
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, {
      action: 'refreshTemplates'
    });
    
    alert('Template deleted successfully!');
    
  } catch (error) {
    console.error('Error deleting template:', error);
    alert('Error deleting template');
  }
}

// Функция отображения тегов в модальном окне редактирования
function renderEditTags() {
  const tagsList = document.getElementById('editTagsList');
  
  tagsList.innerHTML = '';

  currentEditTags.forEach((t, index) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    
    tag.innerHTML = `${escapeHtml(t)}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-remove';
    btn.innerHTML = 'x';
    btn.onclick = () => removeTag(index);

    tag.appendChild(btn);

    tagsList.appendChild(tag);
  });
}

// Функция удаления тега в модальном окне редактирования
function removeEditTag(index) {
  currentEditTags.splice(index, 1);
  renderEditTags();
}

// Make functions global for inline handlers
window.editTemplate = editTemplate;
window.deleteTemplate = deleteTemplate;
window.removeTag = removeTag;