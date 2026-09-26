/**
 * douyin-batch-clean.console.js
 * 粘贴到 https://www.douyin.com/user/self 的 Console 运行
 * 仅操作当前登录账号。safe 模式只统计；live 模式需输入确认短语。
 *
 * 默认：取消喜欢 + 取消收藏，safe 演练模式。
 * 要删除作品或直接执行，请改 CONFIG，或用 index.html 生成定制脚本。
 */
(function () {
  "use strict";
  if (window.__dyCleanRunning) {
    console.warn("[dy-clean] 已在运行中");
    return;
  }
  window.__dyCleanRunning = true;

  const CONFIG = {
    targets: ["likes", "favorites"],
    // safe = 只统计；live = 真删（会弹确认短语）
    mode: "safe",
    delayMs: 1200,
    maxRounds: 30,
    confirmPhrase: "确认清理",
    showPanel: true,
  };

  const LABELS = {
    works: {
      tab: "作品",
      batch: "批量管理",
      exit: "退出管理",
      selectAll: "全选",
      actionCandidates: ["删除", "删除作品", "批量删除"],
      // 抖音弹窗按钮是「确认删除 / 确认取消」，不要点「暂不取消」
      confirmCandidates: ["确认删除", "确认取消", "确定", "确认"],
    },
    likes: {
      tab: "喜欢",
      batch: "批量管理",
      exit: "退出管理",
      selectAll: "全选",
      actionCandidates: ["取消喜欢", "取消点赞"],
      confirmCandidates: ["确认取消", "确定", "确认"],
    },
    favorites: {
      tab: "收藏",
      batch: "批量管理",
      exit: "退出管理",
      selectAll: "全选",
      actionCandidates: ["取消收藏"],
      confirmCandidates: ["确认取消", "确定", "确认"],
    },
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function textOf(el) {
    return ((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim();
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  }

  function findByText(text, { exact = true, clickable = true } = {}) {
    const nodes = Array.from(document.querySelectorAll("button,div,span,a,li,[role=button],[role=tab]"));
    const matches = nodes.filter((el) => {
      const t = textOf(el);
      const ok = exact ? t === text : t.includes(text);
      return ok && visible(el) && (!clickable || el.offsetParent !== null);
    });
    matches.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
    return matches[0] || null;
  }

  function findTab(name) {
    const tabs = Array.from(document.querySelectorAll('[role="tab"], .semi-tabs-tab, a, div'));
    return (
      tabs.find((el) => {
        const t = textOf(el);
        return (t === name || t.startsWith(name + " ") || t.startsWith(name + "\n")) && visible(el);
      }) || null
    );
  }

  function clickEl(el) {
    if (!el) return false;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    if (el.click) el.click();
    return true;
  }

  function getSelectedCount() {
    const label = Array.from(document.querySelectorAll("span,div")).find(
      (el) => /已选\s*\d+/.test(textOf(el)) && el.children.length === 0
    );
    if (!label) return null;
    const m = textOf(label).match(/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  function listIsEmpty() {
    const bodyText = textOf(document.body);
    if (/该账号还未发布过作品哦/.test(bodyText) || /暂无内容/.test(bodyText)) return true;
    const cards = document.querySelectorAll('a[href*="/video/"], a[href*="/note/"], a[href*="/shipin/"]');
    const visibleCards = Array.from(cards).filter(visible);
    return visibleCards.length === 0;
  }

  let panelEl = null;
  function ensurePanel() {
    if (!CONFIG.showPanel || panelEl) return;
    panelEl = document.createElement("div");
    panelEl.id = "__dy-clean-panel";
    panelEl.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:999999",
      "width:320px",
      "max-height:42vh",
      "overflow:auto",
      "background:rgba(18,20,26,.96)",
      "color:#e8eaf0",
      "border:1px solid #2c3140",
      "border-radius:12px",
      "box-shadow:0 12px 40px rgba(0,0,0,.4)",
      "font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace",
      "padding:12px",
    ].join(";");
    panelEl.innerHTML =
      '<div style="font-weight:700;margin-bottom:8px;color:#fe2c55">dy-clean</div><div id="__dy-clean-log"></div>';
    document.body.appendChild(panelEl);
  }

  function log(msg, type) {
    const line = "[" + new Date().toLocaleTimeString() + "] " + msg;
    console.log("[dy-clean]", msg);
    if (!CONFIG.showPanel) return;
    ensurePanel();
    const box = document.getElementById("__dy-clean-log");
    if (!box) return;
    const div = document.createElement("div");
    div.textContent = line;
    if (type === "warn") div.style.color = "#f5a524";
    if (type === "error") div.style.color = "#ff5c7a";
    if (type === "ok") div.style.color = "#3dd68c";
    box.appendChild(div);
    panelEl.scrollTop = panelEl.scrollHeight;
  }

  async function openTarget(kind) {
    const meta = LABELS[kind];
    log("打开目标页: " + kind);
    if (location.pathname.indexOf("/user/self") === -1) {
      location.href = "https://www.douyin.com/user/self";
      await sleep(2500);
    }
    const tab = findTab(meta.tab);
    if (tab) {
      clickEl(tab);
      await sleep(800);
    } else {
      log("未找到 Tab: " + meta.tab + "，尝试继续", "warn");
    }
  }

  async function enterBatch() {
    if (findByText("退出管理")) {
      log("已在批量管理模式");
      return true;
    }
    const btn = findByText("批量管理");
    if (!btn) {
      log("未找到「批量管理」按钮", "error");
      return false;
    }
    clickEl(btn);
    await sleep(700);
    return !!findByText("退出管理");
  }

  async function selectAll() {
    // Semi Design: 点「全选」文字或其外层 checkbox 更稳
    const label = findByText("全选") || findByText("取消全选");
    if (label) {
      const wrap =
        label.closest("span.semi-checkbox") ||
        label.closest("label") ||
        label.closest("span,div");
      const input = wrap && wrap.querySelector('input[type="checkbox"]');
      const checked = input ? input.checked : /取消全选/.test(textOf(label));
      if (!checked) {
        clickEl(wrap || label);
        await sleep(400);
      }
    }
    const selected = getSelectedCount();
    if (selected === 0) {
      const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(visible);
      if (inputs[0]) {
        clickEl(inputs[0].closest("span.semi-checkbox") || inputs[0]);
        await sleep(400);
      }
    }
    return getSelectedCount();
  }

  async function clickAction(kind) {
    const meta = LABELS[kind];
    for (const name of meta.actionCandidates) {
      const btn = findByText(name);
      if (btn && !btn.disabled) {
        log("点击操作: " + name);
        clickEl(btn);
        await sleep(500);
        return true;
      }
    }
    log("未找到可点击的操作按钮", "error");
    return false;
  }

  async function confirmDialog(kind) {
    const meta = LABELS[kind];
    // 抖音真实按钮文案优先：确认取消 / 确认删除
    const preferred = ["确认取消", "确认删除", "确认"];
    const names = preferred.concat(meta.confirmCandidates);
    for (let i = 0; i < 12; i++) {
      for (const name of names) {
        if (name === "暂不取消" || name === "取消") continue;
        const candidates = Array.from(
          document.querySelectorAll("button, [role=button], div, span")
        ).filter((el) => {
          const t = textOf(el);
          return t === name && visible(el);
        });
        // 小的可点击节点优先
        candidates.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
        for (const btn of candidates) {
          const t = textOf(btn);
          if (meta.actionCandidates.includes(t) && !btn.closest('[role="dialog"], [class*="modal"], [class*="Modal"]')) {
            continue;
          }
          log("确认弹窗: " + t);
          clickEl(btn);
          await sleep(500);
          return true;
        }
      }
      await sleep(250);
    }
    log("未识别到确认弹窗（可能已直接生效）", "warn");
    return false;
  }

  async function runOnce(kind) {
    await openTarget(kind);
    await sleep(600);
    const entered = await enterBatch();
    if (!entered) return { ok: false, reason: "no-batch-ui" };

    const before = await selectAll();
    log("已选数量: " + (before == null ? "未知" : before));
    if (before === 0 || listIsEmpty()) {
      log(kind + " 已为空", "ok");
      return { ok: true, empty: true, selected: before };
    }

    if (CONFIG.mode === "safe") {
      log("[safe] 演练模式，跳过真实删除。当前约 " + before + " 条", "warn");
      return { ok: true, dryRun: true, selected: before };
    }

    const clicked = await clickAction(kind);
    if (!clicked) return { ok: false, reason: "no-action" };
    await confirmDialog(kind);
    await sleep(CONFIG.delayMs);
    return { ok: true, selected: before };
  }

  async function runAll() {
    const results = {};
    for (const kind of CONFIG.targets) {
      log("==== 开始: " + kind + " ====");
      let rounds = 0;
      let total = 0;
      while (rounds < CONFIG.maxRounds) {
        rounds += 1;
        const r = await runOnce(kind);
        results[kind] = results[kind] || { rounds: 0, processed: 0 };
        results[kind].rounds = rounds;
        if (r.dryRun) {
          results[kind].dryRun = true;
          results[kind].selected = r.selected;
          break;
        }
        if (r.empty) {
          results[kind].empty = true;
          break;
        }
        if (!r.ok) {
          results[kind].error = r.reason;
          break;
        }
        total += r.selected || 0;
        results[kind].processed = total;
        await sleep(CONFIG.delayMs);
        if (listIsEmpty()) {
          results[kind].empty = true;
          break;
        }
      }
      if (rounds >= CONFIG.maxRounds) results[kind].stopped = "max-rounds";
    }
    log("==== 全部完成 ====", "ok");
    log(JSON.stringify(results, null, 2), "ok");
    window.__dyCleanRunning = false;
    window.__dyCleanResult = results;
    return results;
  }

  async function main() {
    log("配置: " + JSON.stringify(CONFIG));
    if (CONFIG.mode === "live") {
      const answer = prompt(
        "即将对当前登录账号执行不可逆清理。\n目标: " +
          CONFIG.targets.join(", ") +
          "\n请手动输入确认短语继续: " +
          CONFIG.confirmPhrase
      );
      if ((answer || "").trim() !== CONFIG.confirmPhrase) {
        log("确认短语不匹配，已取消", "warn");
        window.__dyCleanRunning = false;
        return;
      }
    }
    await runAll();
  }

  main().catch((err) => {
    console.error("[dy-clean] 失败", err);
    log(String((err && err.message) || err), "error");
    window.__dyCleanRunning = false;
  });
})();
