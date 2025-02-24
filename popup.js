document.getElementById("increase-font").addEventListener("click", () => {
    chrome.scripting.executeScript({
      target: { allFrames: true },
      func: () => {
        document.body.style.fontSize = `${parseInt(window.getComputedStyle(document.body).fontSize) + 2}px`;
      }
    });
  });
  
  document.getElementById("decrease-font").addEventListener("click", () => {
    chrome.scripting.executeScript({
      target: { allFrames: true },
      func: () => {
        document.body.style.fontSize = `${parseInt(window.getComputedStyle(document.body).fontSize) - 2}px`;
      }
    });
  });
  
  document.getElementById("toggle-contrast").addEventListener("click", () => {
    chrome.scripting.executeScript({
      target: { allFrames: true },
      func: () => {
        document.body.style.filter = document.body.style.filter === "invert(1)" ? "none" : "invert(1)";
      }
    });
  });
  