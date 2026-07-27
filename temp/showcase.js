(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let toastTimer;

  function ensureToast() {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    return toast;
  }

  function showToast(message, icon = "✨") {
    const toast = ensureToast();
    toast.innerHTML = `<span aria-hidden="true">${icon}</span><span>${message}</span>`;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function celebrate() {
    showToast("太棒啦！今天又向前走了一大步！", "🎉");
    if (reducedMotion) return;

    const colors = ["#ff5f7a", "#ffd23f", "#65d9ff", "#7a63ee", "#49c98b"];
    for (let index = 0; index < 34; index += 1) {
      const piece = document.createElement("i");
      piece.className = "confetti";
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.setProperty("--confetti", colors[index % colors.length]);
      piece.style.setProperty("--drift", `${Math.round(Math.random() * 180 - 90)}px`);
      piece.style.animationDelay = `${Math.random() * 0.34}s`;
      piece.style.transform = `rotate(${Math.random() * 180}deg)`;
      document.body.appendChild(piece);
      window.setTimeout(() => piece.remove(), 2100);
    }
  }

  document.querySelectorAll("[data-celebrate]").forEach((button) => {
    button.addEventListener("click", celebrate);
  });

  document.querySelectorAll("[data-math-panel]").forEach((panel) => {
    const input = panel.querySelector(".answer-input");
    if (!input) return;

    panel.querySelectorAll("[data-number]").forEach((button) => {
      button.addEventListener("click", () => {
        if (input.value.length < 2) input.value += button.dataset.number;
        input.focus();
      });
    });

    panel.querySelector("[data-clear]")?.addEventListener("click", () => {
      input.value = "";
      input.focus();
      showToast("已经擦干净啦，再想一想。", "🧽");
    });

    const check = () => {
      if (input.value.trim() === "5") {
        celebrate();
      } else if (!input.value.trim()) {
        showToast("先把答案放进小方框里吧！", "👆");
      } else {
        showToast("很接近！可以再数一数星星。", "🌟");
      }
    };

    panel.querySelector("[data-check]")?.addEventListener("click", check);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") check();
    });
  });

  document.querySelectorAll("[data-range]").forEach((range) => {
    const output = document.querySelector(`[data-range-output="${range.id}"]`);
    const update = () => {
      if (output) output.textContent = range.value;
    };
    range.addEventListener("input", update);
    update();
  });

  document.querySelectorAll(".choice input").forEach((input) => {
    input.addEventListener("change", () => {
      const isCheckbox = input.type === "checkbox";
      showToast(isCheckbox ? "收到！可以继续选择。" : "选择完成，答案记在本页里了。", isCheckbox ? "✅" : "🎯");
    });
  });

  const chartSets = {
    week: [64, 82, 52, 91, 72, 44, 68],
    month: [78, 58, 88, 70, 96, 84, 90],
  };

  document.querySelectorAll("[data-chart-tabs]").forEach((toolbar) => {
    const chart = toolbar.closest(".panel")?.querySelector(".bar-chart");
    if (!chart) return;
    const bars = [...chart.querySelectorAll(".bar")];

    toolbar.querySelectorAll(".segment").forEach((segment) => {
      segment.addEventListener("click", () => {
        toolbar.querySelectorAll(".segment").forEach((item) => {
          const selected = item === segment;
          item.classList.toggle("active", selected);
          item.setAttribute("aria-selected", selected ? "true" : "false");
        });

        const values = chartSets[segment.dataset.period] || chartSets.week;
        bars.forEach((bar, index) => {
          const value = values[index % values.length];
          bar.style.setProperty("--height", `${value}%`);
          bar.dataset.value = `${value}`;
        });
      });
    });
  });

  document.querySelectorAll("[data-sound]").forEach((button) => {
    button.addEventListener("click", () => {
      const isOn = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", isOn ? "false" : "true");
      button.textContent = isOn ? "🔇" : "🔊";
      button.setAttribute("aria-label", isOn ? "打开示例音效" : "关闭示例音效");
      showToast(isOn ? "示例音效已关闭。" : "示例音效已打开（样稿不会真的发声）。", isOn ? "🔇" : "🔊");
    });
  });

  document.querySelectorAll("[data-save-demo]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast("这是静态样稿，不会保存真实数据。", "🧪");
    });
  });
})();
