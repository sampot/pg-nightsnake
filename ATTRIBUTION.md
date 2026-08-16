# 燈籠蛇 — 製作與署名

程式、規則設計、介面與 CSS 為本專案原創。以下第三方素材皆為 **CC0 1.0**；即使授權未要求署名，本專案仍逐項列出作者與來源。

## 美術

| 檔案 | 來源 | 作者 | 授權 |
| --- | --- | --- | --- |
| `assets/images/night.png` | [Roguelike Modern City](https://kenney.nl/assets/roguelike-modern-city)（`Tilemap/tilemap_packed.png`）、[Tiny Creatures](https://kenney.nl/assets/tiny-creatures)（`Tilemap/tilemap_packed.png`）、[Particle Pack](https://kenney.nl/assets/particle-pack)（`PNG (Transparent)`） | Kenney | CC0 1.0 |
| `assets/images/garland.png` | 由 `night.png` 的燈籠格裁切平舖而成（頁面上方那排掛燈） | Kenney（素材）／本專案（組圖） | CC0 1.0 |

`night.png` 是把需要的圖磚放大拼成 10 格 64×64 的圖集。Roguelike Modern City 原圖 37 欄，index = row × 37 + col：

| 圖集格 | 用途 | 取用的原始素材 |
| --- | --- | --- |
| 0 | 柏油地磚 | Modern City tile 714 |
| 1 | 鐵格柵地磚（零星舖在地面上） | Modern City tile 755 |
| 2 | 紅燈籠 | Modern City tile 472（遮陽棚橫紋，重上色成燈紙）＋ Particle Pack `light_01.png` |
| 3 | 金燈籠 | 同上，換成金色色階 |
| 4 | 攤傘 | Modern City tile 553 |
| 5 | 攤車 | Modern City tile 591 |
| 6 | 蛇頭 | Tiny Creatures 第 5 列第 1 格的綠蛇，裁 8×8 頭部、去掉圖磚底色 |
| 7 | 暖色光暈 | Particle Pack `light_01.png` |
| 8 | 金色光暈 | Particle Pack `light_01.png` |
| 9 | 火花 | Particle Pack `star_08.png` |

燈籠的鼓面明暗、燈頭燈腳的木蓋與外框是產圖時用遮罩合成，蛇身、夜色壓暗、街燈光池、格線與金燈籠的倒數環是執行時用 canvas 繪製，非圖磚。

## 音樂

| 檔案 | 曲目 | 作者 | 授權 |
| --- | --- | --- | --- |
| `assets/audio/music.ogg` | `SwitchWithMeTheme_Loopable`，出自 [Not Jam Music Pack](https://not-jam.itch.io/not-jam-music-pack) | Not Jam | CC0 1.0 |
| `assets/audio/level.ogg` | `jingles_STEEL00`，出自 [Music Jingles](https://kenney.nl/assets/music-jingles) | Kenney | CC0 1.0 |
| `assets/audio/over.ogg` | `jingles_STEEL09`，出自 [Music Jingles](https://kenney.nl/assets/music-jingles) | Kenney | CC0 1.0 |

## 音效

| 檔案 | 原始檔 | 來源 | 作者 | 授權 |
| --- | --- | --- | --- | --- |
| `assets/audio/eat.ogg` | `confirmation_001.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| `assets/audio/golden.ogg` | `pluck_002.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| `assets/audio/turn.ogg` | `tick_002.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| `assets/audio/stall.ogg` | `drop_002.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| `assets/audio/click.ogg` | `click_002.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| `assets/audio/crash.ogg` | `impactPlate_heavy_004.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 1.0 |

授權原文置於 [`assets/licenses/`](./assets/licenses/)。素材取自 [playgrounds/game-assets](https://github.com/sampot/playgrounds/tree/main/game-assets)，對照表見該目錄的 [`ATTRIBUTION.md`](https://github.com/sampot/playgrounds/blob/main/game-assets/ATTRIBUTION.md)。
