// Фонный скрипт для контекстного меню
chrome.runtime.onInstalled.addListener(() => {
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

// Обработчик клика по контекстному меню
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab.id) return;

  switch (info.menuItemId) {
    case "saveTemplate":
      chrome.tabs.sendMessage(tab.id, {
        action: "saveSelectionAsTemplate"
      });
      break;
  }
});