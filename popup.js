document.getElementById("increase-font").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          document.body.style.fontSize = `${parseInt(window.getComputedStyle(document.body).fontSize) + 2}px`;
        }
      });
    });
  });
  
  document.getElementById("decrease-font").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          document.body.style.fontSize = `${parseInt(window.getComputedStyle(document.body).fontSize) - 2}px`;
        }
      });
    });
  });
  
  document.getElementById("toggle-contrast").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          document.body.style.filter = document.body.style.filter === "invert(1)" ? "none" : "invert(1)";
        }
      });
    });
  });