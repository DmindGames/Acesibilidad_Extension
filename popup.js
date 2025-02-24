document.getElementById("increase-font").addEventListener("click", () => {
    chrome.scripting.executeScript({ target: { allFrames: true }, func: () => changeFontSize('+') });
  });
  
  document.getElementById("decrease-font").addEventListener("click", () => {
    chrome.scripting.executeScript({ target: { allFrames: true }, func: () => changeFontSize('-') });
  });
  
  document.getElementById("toggle-contrast").addEventListener("click", () => {
    chrome.scripting.executeScript({ target: { allFrames: true }, func: () => toggleContrast() });
  });