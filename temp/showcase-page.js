(() => {
  "use strict";

  const styles = {
    sunshine: {
      bodyClass: "theme-sunshine",
      brandIcon: "🪁",
      brand: "Mumu 学习岛",
      eyebrow: "今日探险 · 第 3 站",
      title: "和小太阳一起，<span>玩转数字！</span>",
      description: "数一数、想一想、点一点。每完成一个小挑战，就把一颗快乐星星带回家。",
      mascot: "🐣",
      orbit: ["3", "⭐", "＋"],
      primary: "开始今天的探险",
      secondary: "看看我的星星",
      sectionKicker: "PLAY & LEARN",
      sectionTitle: "今天玩什么？",
      sectionDescription: "短短 10 分钟，完成三种不同的小练习。",
    },
    galaxy: {
      bodyClass: "theme-galaxy",
      brandIcon: "🚀",
      brand: "Mumu 星际学院",
      eyebrow: "任务 03 · 数字星云",
      title: "小小宇航员，<span>准备发射！</span>",
      description: "启动数字雷达，完成三项太空任务。每个正确答案都会点亮一颗新星球。",
      mascot: "🧑‍🚀",
      orbit: ["03", "🪐", "＋"],
      primary: "启动探索任务",
      secondary: "打开星球图鉴",
      sectionKicker: "MISSION CONTROL",
      sectionTitle: "今日太空任务",
      sectionDescription: "完成数字补给、形状扫描和时间推进器。",
    },
    forest: {
      bodyClass: "theme-forest",
      brandIcon: "🍃",
      brand: "Mumu 森林学校",
      eyebrow: "森林晨会 · 松鼠班",
      title: "翻开绘本，<span>数字醒来啦！</span>",
      description: "跟着小狐狸穿过纸片森林，收集果实、观察形状，再画出今天的成长树。",
      mascot: "🦊",
      orbit: ["🍎", "3", "＋"],
      primary: "走进今天的故事",
      secondary: "翻看成长树",
      sectionKicker: "STORY & DISCOVERY",
      sectionTitle: "森林里的三件事",
      sectionDescription: "像读绘本一样，一页一页完成今天的小发现。",
    },
    arcade: {
      bodyClass: "theme-arcade",
      brandIcon: "🕹️",
      brand: "MUMU PLAY!",
      eyebrow: "LEVEL 03 · READY!",
      title: "数字玩家，<span>开始闯关！</span>",
      description: "按下按钮、选中答案、蓄满能量条。连续完成任务，解锁今天的超级徽章！",
      mascot: "😺",
      orbit: ["+1", "🏆", "GO"],
      primary: "开始第一关",
      secondary: "查看排行榜",
      sectionKicker: "3 LEVELS TODAY",
      sectionTitle: "今天的挑战地图",
      sectionDescription: "每一关都很短，完成后立刻得到奖励反馈。",
    },
    lab: {
      bodyClass: "theme-lab",
      brandIcon: "🔬",
      brand: "Mumu 彩虹实验室",
      eyebrow: "实验记录 · 07 月 27 日",
      title: "提出问题，<span>动手找答案。</span>",
      description: "从数字、形状和时间开始一次小实验。大胆猜一猜，再用练习验证自己的想法。",
      mascot: "🧑‍🔬",
      orbit: ["?", "🔷", "5"],
      primary: "开始今天的实验",
      secondary: "查看实验记录",
      sectionKicker: "OBSERVE · TRY · LEARN",
      sectionTitle: "三项迷你实验",
      sectionDescription: "信息更清晰、留白更多，适合长期扩展学习模块。",
    },
  };

  const key = document.body.dataset.style || "sunshine";
  const style = styles[key] || styles.sunshine;
  document.body.className = style.bodyClass;

  document.body.innerHTML = `
    <div class="page-shell">
      <header class="topbar">
        <a class="brand" href="./index.html">
          <span class="brand-mark" aria-hidden="true">${style.brandIcon}</span>
          <span>${style.brand}</span>
        </a>
        <div class="top-actions">
          <a class="back-pill" href="./index.html"><span aria-hidden="true">←</span> 全部风格</a>
          <button class="sound-button" type="button" data-sound aria-pressed="false" aria-label="打开示例音效">🔇</button>
        </div>
      </header>

      <main>
        <section class="hero">
          <div class="hero-copy">
            <p class="eyebrow">${style.eyebrow}</p>
            <h1>${style.title}</h1>
            <p>${style.description}</p>
            <div class="hero-actions">
              <a class="button primary" href="#practice">▶ ${style.primary}</a>
              <button class="button secondary" type="button" data-celebrate>🏅 ${style.secondary}</button>
            </div>
            <div class="progress-ribbon">
              <strong>本周进度</strong>
              <span class="progress-track" aria-label="本周进度 72%">
                <span class="progress-fill" style="width: 72%"></span>
              </span>
              <strong>72%</strong>
            </div>
          </div>
          <div class="hero-visual" aria-hidden="true">
            <div class="mascot-orbit">
              <div class="mascot">${style.mascot}</div>
              <span class="orbit-chip one">${style.orbit[0]}</span>
              <span class="orbit-chip two">${style.orbit[1]}</span>
              <span class="orbit-chip three">${style.orbit[2]}</span>
            </div>
          </div>
        </section>

        <section id="practice" aria-labelledby="practice-title">
          <div class="section-heading">
            <div>
              <span class="section-kicker">${style.sectionKicker}</span>
              <h2 id="practice-title">${style.sectionTitle}</h2>
            </div>
            <p>${style.sectionDescription}</p>
          </div>

          <div class="practice-grid">
            <article class="panel large" data-math-panel>
              <div class="panel-label">
                <h3>数字加法</h3>
                <span class="step-badge">⭐ 10 分</span>
              </div>
              <p>两颗星星和三颗星星在一起，一共有几颗？</p>
              <div class="math-question" aria-label="2 加 3 等于多少">
                <span>2</span><span>+</span><span>3</span><span>=</span>
                <input class="answer-input" inputmode="numeric" maxlength="2" aria-label="请输入答案" />
              </div>
              <div class="number-pad" aria-label="数字键盘">
                <button class="key-button" type="button" data-number="1">1</button>
                <button class="key-button" type="button" data-number="2">2</button>
                <button class="key-button" type="button" data-number="3">3</button>
                <button class="key-button" type="button" data-number="4">4</button>
                <button class="key-button" type="button" data-number="5">5</button>
                <button class="key-button" type="button" data-number="6">6</button>
                <button class="key-button" type="button" data-number="7">7</button>
                <button class="key-button" type="button" data-number="8">8</button>
                <button class="key-button" type="button" data-number="9">9</button>
                <button class="key-button" type="button" data-number="0">0</button>
                <button class="key-button clear" type="button" data-clear aria-label="清除答案">擦掉</button>
                <button class="key-button check" type="button" data-check>检查</button>
              </div>
            </article>

            <article class="panel medium">
              <div class="panel-label">
                <h3>找出圆形</h3>
                <span class="step-badge">单选</span>
              </div>
              <div class="option-list" role="radiogroup" aria-label="找出圆形">
                <label class="choice">
                  <input type="radio" name="shape" />
                  <span>三角形</span><span class="choice-emoji" aria-hidden="true">🔺</span>
                  <span class="choice-check" aria-hidden="true">✓</span>
                </label>
                <label class="choice">
                  <input type="radio" name="shape" />
                  <span>圆形</span><span class="choice-emoji" aria-hidden="true">🔵</span>
                  <span class="choice-check" aria-hidden="true">✓</span>
                </label>
                <label class="choice">
                  <input type="radio" name="shape" />
                  <span>正方形</span><span class="choice-emoji" aria-hidden="true">🟨</span>
                  <span class="choice-check" aria-hidden="true">✓</span>
                </label>
              </div>
            </article>

            <article class="panel half">
              <div class="panel-label">
                <h3>选出会飞的朋友</h3>
                <span class="step-badge">可多选</span>
              </div>
              <div class="option-list">
                <label class="choice">
                  <input type="checkbox" />
                  <span>小鸟</span><span class="choice-emoji" aria-hidden="true">🐦</span>
                  <span class="choice-check" aria-hidden="true">✓</span>
                </label>
                <label class="choice">
                  <input type="checkbox" />
                  <span>蝴蝶</span><span class="choice-emoji" aria-hidden="true">🦋</span>
                  <span class="choice-check" aria-hidden="true">✓</span>
                </label>
                <label class="choice">
                  <input type="checkbox" />
                  <span>小乌龟</span><span class="choice-emoji" aria-hidden="true">🐢</span>
                  <span class="choice-check" aria-hidden="true">✓</span>
                </label>
              </div>
            </article>

            <article class="panel half">
              <div class="panel-label">
                <h3>设置练习时间</h3>
                <span class="step-badge">滑一滑</span>
              </div>
              <p>今天想挑战多长时间？短短几分钟也很棒。</p>
              <div class="range-wrap">
                <div class="range-value"><span data-range-output="practice-time">10</span><small>分钟</small></div>
                <input id="practice-time" type="range" min="5" max="20" step="5" value="10" data-range />
                <div class="range-labels"><span>5 分钟</span><span>20 分钟</span></div>
              </div>
            </article>
          </div>
        </section>

        <section aria-labelledby="progress-title">
          <div class="section-heading">
            <div>
              <span class="section-kicker">FOR GROWN-UPS</span>
              <h2 id="progress-title">成长小面板</h2>
            </div>
            <p>同一套视觉语言下，家长信息更紧凑，但仍然清晰、温和。</p>
          </div>

          <div class="practice-grid">
            <article class="panel large">
              <div class="chart-toolbar">
                <div>
                  <span class="section-kicker">LEARNING PULSE</span>
                  <h3 style="margin: 3px 0 0">专注练习趋势</h3>
                </div>
                <div class="segmented" role="tablist" aria-label="图表时间范围" data-chart-tabs>
                  <button class="segment active" type="button" role="tab" aria-selected="true" data-period="week">本周</button>
                  <button class="segment" type="button" role="tab" aria-selected="false" data-period="month">本月</button>
                </div>
              </div>
              <div class="stat-grid">
                <div class="stat-card"><span>练习天数</span><strong>5 天</strong></div>
                <div class="stat-card"><span>完成题目</span><strong>42 题</strong></div>
                <div class="stat-card"><span>连续记录</span><strong>3 天</strong></div>
              </div>
              <div class="bar-chart" role="img" aria-label="周一到周日的练习趋势柱状图">
                <div class="bar-item"><i class="bar" style="--height: 64%" data-value="64"></i><span class="bar-label">一</span></div>
                <div class="bar-item"><i class="bar" style="--height: 82%" data-value="82"></i><span class="bar-label">二</span></div>
                <div class="bar-item"><i class="bar" style="--height: 52%" data-value="52"></i><span class="bar-label">三</span></div>
                <div class="bar-item"><i class="bar" style="--height: 91%" data-value="91"></i><span class="bar-label">四</span></div>
                <div class="bar-item"><i class="bar" style="--height: 72%" data-value="72"></i><span class="bar-label">五</span></div>
                <div class="bar-item"><i class="bar" style="--height: 44%" data-value="44"></i><span class="bar-label">六</span></div>
                <div class="bar-item"><i class="bar" style="--height: 68%" data-value="68"></i><span class="bar-label">日</span></div>
              </div>
            </article>

            <article class="panel medium">
              <div class="panel-label">
                <h3>徽章收藏</h3>
                <span class="step-badge">8 / 12</span>
              </div>
              <div class="achievement-list">
                <div class="achievement">
                  <span class="achievement-icon">🧮</span>
                  <span><strong>加法新星</strong><small>再完成 3 道题</small></span>
                  <span class="mini-progress"><span style="width: 76%"></span></span>
                </div>
                <div class="achievement">
                  <span class="achievement-icon">🔍</span>
                  <span><strong>观察家</strong><small>已经获得</small></span>
                  <span class="tiny-badge">完成</span>
                </div>
                <div class="achievement">
                  <span class="achievement-icon">🔥</span>
                  <span><strong>连续练习</strong><small>保持 3 天</small></span>
                  <span class="mini-progress"><span style="width: 60%"></span></span>
                </div>
              </div>
            </article>

            <article class="panel full">
              <div class="panel-label">
                <h3>表单与设置组件</h3>
                <span class="step-badge">组件预览</span>
              </div>
              <div class="control-grid">
                <label class="field">
                  <span>昵称输入框</span>
                  <input class="text-input" type="text" placeholder="例如：小小探险家" />
                </label>
                <label class="field">
                  <span>练习主题</span>
                  <select class="select-input">
                    <option>数字与算术</option>
                    <option>图形与空间</option>
                    <option>生活小常识</option>
                  </select>
                </label>
                <label class="toggle-row">
                  <span>答题后显示鼓励动画</span>
                  <span class="toggle">
                    <input type="checkbox" checked aria-label="答题后显示鼓励动画" />
                    <span class="toggle-track"></span>
                  </span>
                </label>
                <label class="toggle-row">
                  <span>减少界面动态效果</span>
                  <span class="toggle">
                    <input type="checkbox" aria-label="减少界面动态效果" />
                    <span class="toggle-track"></span>
                  </span>
                </label>
              </div>
              <div class="feedback-strip">
                <span class="feedback-icon" aria-hidden="true">🌱</span>
                <span><strong>温和的反馈信息</strong><small>今天完成 10 分钟就很好，不需要追求满分。</small></span>
                <span class="tiny-badge">进步中</span>
              </div>
              <div class="button-row" style="margin-top: 20px">
                <button class="button primary small" type="button" data-save-demo>保存设置</button>
                <button class="button secondary small" type="button" data-celebrate>试试庆祝动效</button>
              </div>
            </article>
          </div>
        </section>
      </main>

      <footer class="footer-note">
        视觉方向样稿 · 所有操作只在当前页面演示，不读取、不存储任何真实数据。
      </footer>
    </div>
  `;
})();
