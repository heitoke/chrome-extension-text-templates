// Фонный скрипт для контекстного меню
chrome.runtime.onInstalled.addListener(() => {
  // Удаляем старые меню если есть
  chrome.contextMenus.removeAll(() => {
    // Создаем главное меню расширения
    chrome.contextMenus.create({
      id: "templateHelper",
      title: "Template Helper",
      contexts: ["selection"]
    });

    // Подменю для сохранения
    chrome.contextMenus.create({
      id: "saveTemplate",
      parentId: "templateHelper",
      title: "Сохранить выделенный текст как шаблон",
      contexts: ["selection"]
    });
  });
});

// Обработчик клика по контекстному меню
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('Context menu clicked:', info.menuItemId, tab);
  
  if (!tab || !tab.id) {
    console.error('No tab available');
    return;
  }

  try {
    switch (info.menuItemId) {
      case "saveTemplate":
        console.log('Saving template from selection:', info.selectionText);
        chrome.tabs.sendMessage(tab.id, {
          action: "saveSelectionAsTemplate"
        })
        break;
    }
  } catch (error) {
    console.error('Error in context menu handler:', error);
  }
});

// Обработчик обновления вкладки - пересоздаем контекстное меню если нужно
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // Проверяем существует ли меню, если нет - создаем
    chrome.contextMenus.removeAll(() => {
      createContextMenus();
    });
  }
});

function createContextMenus() {
  chrome.contextMenus.create({
    id: "templateHelper",
    title: "Template Helper",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "saveTemplate",
    parentId: "templateHelper",
    title: "Сохранить выделенный текст как шаблон",
    contexts: ["selection"]
  });
}