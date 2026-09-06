# 背景音乐与宝石音效来源

所有运行时音频随本工程分发，无需联网播放。中文曲目名为本工程显示名称。

| 用途 | 原作 / 作者 | 原始来源 | 许可 |
| --- | --- | --- | --- |
| 晶光漫步 | Puzzling / Ruskerdax | https://opengameart.org/content/puzzling | CC0-1.0 |
| 星云漫游 | Sci-fi Puzzle In-Game 3 / MintoDog | https://opengameart.org/content/sci-fi-puzzle-in-game-3 | CC0-1.0 |
| 阳光航线 | City Loop / wipics | https://opengameart.org/content/city-loop-0 | CC0-1.0 |
| 宝石九类操作与消除声音 | Interface Sounds / Kenney | https://kenney.nl/assets/interface-sounds | CC0-1.0 |

来源页面于 2026-09-06 核对。许可说明：https://creativecommons.org/publicdomain/zero/1.0/

Puzzling 原始下载：https://opengameart.org/sites/default/files/ruskerdax_-_puzzling.mp3
Sci-fi 原始下载：https://opengameart.org/sites/default/files/sci-fi_puzzle_in-game_3_bpm100.mp3
Kenney 原始图包：https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip

原音乐文件保存在本目录，Kenney 选定的原音频保存在 assets/audio/bejeweled/；新运行时音频做音量归一化与淡入淡出处理，参数和摘要见 manifest.json。阳光航线复用 apps/web/public/audio/tetris/music.cc0.mp3，原始文件、摘要与来源链见该目录 manifest.json 和 assets/audio/galaxy-racer/，避免复制第三份文件。
