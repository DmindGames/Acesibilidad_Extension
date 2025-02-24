(() => {
    console.log("Extensión de accesibilidad cargada 🚀");
  
    const elements = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'p', 'li', 'span', 'b', 'button', 'ul', 'strong'];
  
    function changeFontSize(operator) {
      elements.forEach(tag => {
        document.querySelectorAll(tag).forEach(el => {
          let currentSize = parseInt(window.getComputedStyle(el).fontSize);
          el.style.fontSize = (operator === '+' ? currentSize + 2 : currentSize - 2) + "px";
        });
      });
    }
  
    function toggleContrast() {
      document.body.classList.toggle('contrast');
    }
  
    function createAccessibilityMenu() {
      let menu = document.createElement("div");
      menu.innerHTML = `
        <div id="accessibility-menu" style="position: fixed; top: 10px; right: 10px; background: black; color: white; padding: 10px; z-index: 10000;">
          <button id="increase-font">A+</button>
          <button id="decrease-font">A-</button>
          <button id="toggle-contrast">Contraste</button>
        </div>
      `;
      document.body.appendChild(menu);
  
      document.getElementById("increase-font").addEventListener("click", () => changeFontSize('+'));
      document.getElementById("decrease-font").addEventListener("click", () => changeFontSize('-'));
      document.getElementById("toggle-contrast").addEventListener("click", toggleContrast);
    }
  
    createAccessibilityMenu();
  })();