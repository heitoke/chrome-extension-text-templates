// Загрузка данных
document.addEventListener('DOMContentLoaded', async () => {
  await loadTemplates();
  bindEvents();
  updateSnippetsCount();
});

async function loadTemplates() {
  const result = await chrome.storage.sync.get({
    templates: []
  });
  
  renderTemplates(result.templates);
}

function renderTemplates(templates) {
  const templatesList = document.getElementById('templatesList');
  
  if (templates.length === 0) {
    templatesList.innerHTML = `
      <div class="empty-state">
        <p>No snippets yet</p>
        <small>Create your first snippet above</small>
      </div>
    `;
    return;
  }

  templatesList.innerHTML = templates.map((template, index) => `
    <div class="template-item" data-index="${index}">
      <div class="template-content">
        <div class="template-shortcut">${template.shortcut || 'no-shortcut'}</div>
        <div class="template-text">${escapeHtml(template.text || '')}</div>
      </div>
      <div class="template-actions">
        <button class="template-action-btn" onclick="editTemplate(${index})" title="Edit">✏️</button>
        <button class="template-action-btn" onclick="deleteTemplate(${index})" title="Delete">🗑️</button>
      </div>
    </div>
  `).join('');

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

function bindEvents() {
  // Save snippet
  document.getElementById('saveSnippet').addEventListener('click', saveSnippet);
  
  // Enter key in inputs
  document.getElementById('shortcutInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('snippetText').focus();
    }
  });
  
  document.getElementById('snippetText').addEventListener('keypress', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      saveSnippet();
    }
  });

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
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('helpBtn').addEventListener('click', showHelp);
}

async function saveSnippet() {
  const shortcut = document.getElementById('shortcutInput').value.trim();
  const text = document.getElementById('snippetText').value.trim();

  if (!shortcut || !text) {
    alert('Please fill in both shortcut and text');
    return;
  }

  try {
    const template = {
      shortcut: shortcut,
      text: text,
      html: text, // For now, we'll use the same text for HTML
      createdAt: new Date().toISOString(),
      hasStyle: text.includes('**') || text.includes('*') // Simple style detection
    };

    const result = await chrome.storage.sync.get({ templates: [] });
    const templates = result.templates || [];
    
    // Check if shortcut already exists
    const existingIndex = templates.findIndex(t => t.shortcut === shortcut);
    if (existingIndex !== -1) {
      templates[existingIndex] = template;
    } else {
      templates.unshift(template);
    }
    
    await chrome.storage.sync.set({ templates });
    
    // Clear inputs
    document.getElementById('shortcutInput').value = '';
    document.getElementById('snippetText').value = '';
    
    // Refresh display
    await loadTemplates();
    updateSnippetsCount();
    
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

async function deleteTemplate(index) {
  if (!confirm('Delete this snippet?')) return;
  
  const result = await chrome.storage.sync.get({ templates: [] });
  const templates = result.templates || [];
  templates.splice(index, 1);
  
  await chrome.storage.sync.set({ templates });
  await loadTemplates();
  updateSnippetsCount();
}

async function editTemplate(index) {
  const result = await chrome.storage.sync.get({ templates: [] });
  const template = result.templates[index];
  
  if (template) {
    document.getElementById('shortcutInput').value = template.shortcut || '';
    document.getElementById('snippetText').value = template.text || '';
    document.getElementById('shortcutInput').focus();
    
    // Delete the old one
    const templates = result.templates || [];
    templates.splice(index, 1);
    await chrome.storage.sync.set({ templates });
    await loadTemplates();
    updateSnippetsCount();
  }
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
      template.shortcut?.toLowerCase().includes(query.toLowerCase()) ||
      template.text?.toLowerCase().includes(query.toLowerCase())
    );
    
    if (filtered.length === 0) {
      searchResults.innerHTML = '<div class="empty-state"><p>No snippets found</p></div>';
      return;
    }
    
    searchResults.innerHTML = filtered.map((template, index) => `
      <div class="template-item" data-index="${index}">
        <div class="template-content">
          <div class="template-shortcut">${template.shortcut || 'no-shortcut'}</div>
          <div class="template-text">${escapeHtml(template.text || '')}</div>
        </div>
      </div>
    `).join('');
    
    // Add click handlers for search results
    searchResults.querySelectorAll('.template-item').forEach(item => {
      item.addEventListener('click', () => {
        const originalIndex = templates.findIndex(t => t.shortcut === filtered[item.dataset.index].shortcut);
        useTemplate(originalIndex);
      });
    });
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
        
        // Merge templates, avoid duplicates by shortcut
        importedData.forEach(newTemplate => {
          const existingIndex = templates.findIndex(t => t.shortcut === newTemplate.shortcut);
          if (existingIndex !== -1) {
            templates[existingIndex] = newTemplate;
          } else {
            templates.push(newTemplate);
          }
        });
        
        await chrome.storage.sync.set({ templates });
        await loadTemplates();
        updateSnippetsCount();
        
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

• Create snippets with shortcuts (e.g.: "asap")
• Use **bold** and *italic* formatting
• Press Ctrl+Space in text fields to insert snippets
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

// Make functions global for inline handlers
window.editTemplate = editTemplate;
window.deleteTemplate = deleteTemplate;