# Demographic & Geographic Fact Sheet: Bangladesh vs. Russia

This reference documents every demographic, cartographic, hydrological, and climatological statistic used in `data/script.json` and the 8 documentary scenes of **Bangladesh vs. Russia: Population Comparison by Size**.

---

## 1. Primary Sources

1. **United Nations DESA, Population Division** — *World Population Prospects 2024* (2024–2026 mid-year estimates and historical series 1950–2025) and *World Urbanization Prospects*.
2. **Food and Agriculture Organization (FAO) & World Bank WDI** — Official sovereign total surface area (`AG.SRF.TOTL.K2`) and dry land area excluding inland water bodies (`AG.LND.TOTL.K2`).
3. **Bangladesh Bureau of Statistics (BBS)** — *Population and Housing Census 2022* (post-enumeration adjusted baseline) and post-2015 Land Boundary Agreement territorial survey (`148,460 km²`).
4. **Federal State Statistics Service of Russia (Rosstat)** — Official demographic yearbook and subnational census figures for the Republic of Sakha (Yakutia) and Federal Districts.
5. **International Permafrost Association (IPA) / USGS (Brown et al.)** — *Circum-Arctic Map of Permafrost and Ground-Ice Conditions* (~65% permafrost extent across Russian territory).
6. **Milliman & Farnsworth (2011) / BWDB** — *River Discharge to the Coastal Ocean*: annual suspended sediment flux of the combined Ganges–Brahmaputra–Meghna (Padma–Jamuna–Meghna) system (~1.0–1.1 billion metric tons/year).

---

## 2. Core National Comparison

| Metric | Bangladesh | Russia | Ratio / Gap |
| :--- | :--- | :--- | :--- |
| **Total Surface Area** | `148,460 km²` | `17,098,246 km²` (`~17.1M km²`) | Russia is **`115.17×`** (`~115.2×`) larger |
| **Dry Land Area (excl. water)** | `130,170 km²` | `16,376,870 km²` | Russia is **`125.81×`** larger |
| **Share of Earth's Landmass** (`148.94M km²`) | `0.10%` | `11.48%` (`~11%`) | 1/9th of global dry land |
| **Total Population (2025/2026 est.)** | **`~175 million`** (`173.6M–175.7M`) | **`~144 million`** (`144.2M–144.8M`) | Bangladesh has **`+31 million`** more people |
| **Density (Dry Land Area)** | **`1,333–1,344 / km²`** (`>1,330 / km²`) | **`8.8 / km²`** | **`152×`** (dry-to-dry) |
| **Density (Total Surface Area)** | **`1,178.8 / km²`** | **`8.43 / km²`** (`8.4 / km²`) | **`158×`** (`1,330` BD land vs `8.4` RU total) |
| **East–West Span** | `~600 km` | `~9,000 km` (Kaliningrad–Vladivostok) | `15×` wider (~11-hour flight) |
| **Time Zones** | `1` (`UTC+6`) | `11` (`UTC+2` to `UTC+12`) | `11:1` |

---

## 3. Scene-by-Scene Verification & Derivations

### Scene 01 — The Scale Paradox
- **Russia total area**: `17,098,246 km²` across **11 time zones**, representing `17.098M / 148.94M = 11.48%` (~**11%**) of Earth's total land area.
- **Bangladesh total area**: `148,460 km²` (`17,098,246 / 148,460 = 115.17`, or **115 times smaller**).
- **Population inversion**: Bangladesh holds **~175 million** residents vs. Russia's **~144 million**, a net difference of **31 million more people** inside less than one percent of Russia's area.

### Scene 02 — True Size Overlay
- **Equal-area tiling**: Standard Web Mercator inflates Russia's high-latitude area visually (`50°N–81°N`) relative to tropical Bangladesh (`20°N–26°N`). Under a true equal-area projection, exactly **115 whole copies** (`115.17×`) of Bangladesh's `148,460 km²` footprint fit inside Russia's borders.
- **Transcontinental distance**: Direct air corridor from Kaliningrad (`20.5°E`) to Vladivostok (`131.9°E`) spans roughly **9,000 km** (~**11 hours** flight time), compared with roughly **600 km** across Bangladesh's widest east–west breadth.

### Scene 03 — Yakutia vs. Bangladesh
- **Republic of Sakha (Yakutia)**: Largest subnational administrative unit on Earth at **`3,083,523 km²`** (`3.08M km²`), which is `3,083,523 / 148,460 = 20.77×` (**`20.8×` larger than Bangladesh**).
- **Population & climate of Sakha**: Home to **~1.00 million** people (`~995k–1.00M`, density `0.32 / km²`), where continental subarctic winters routinely plunge to **`-50°C`** (with Northern Hemisphere cold poles Oymyakon and Verkhoyansk recording `-67.7°C`).
- **Bangladesh climate**: Tropical monsoon plains with mean warm-season temperatures around **`+28°C`** (annual mean `~26°C`) and `2,200–2,500 mm` annual rainfall.
- **Greater Dhaka vs. All Siberia**: The Greater Dhaka metropolitan region (**~24 million** residents, UN/Demographia urban agglomeration range `23.9M–24.7M`) approaches the entire population of **geographic Siberia / Asian Russia** (**~36 million** people spread across **`13.1 million km²`** east of the Urals, ~77% of Russia's territory).

### Scene 04 — Inside One Square Kilometer
- **Russia benchmark**: `144,200,000 / 17,098,246 km² = 8.43` (**`8.4 people per km²`**).
- **Bangladesh benchmark**: Subtracting `18,290 km²` of major perennial river channels and estuarine waters from `148,460 km²` leaves **`130,170 km²`** of habitable dry land (`UN/World Bank land area`). Dividing `173.6M–175.0M` by `130,170 km²` yields **`1,333–1,344 people per km²`** ("over `1,330` people per km² of land"), roughly **`158×`** Russia's `8.4 / km²` benchmark (`1,330 / 8.4 = 158.3`).

### Scene 05 — The Himalayan Delta Engine
- **Fluvial sediment engine**: Three major Himalayan-fed rivers converge in Bangladesh—the **Padma** (Ganges), **Jamuna** (Brahmaputra), and **Meghna**—depositing roughly **1.0 to 1.1 billion metric tons** of mineral-rich alluvial silt annually across the Bengal Basin, forming the world's largest river delta.
- **Triple rice harvest**: Fertile alluvium, shallow groundwater aquifers, warm year-round temperatures, and monsoon rains sustain up to **three rice crops per year** (*Aus*, *Aman*, and irrigated *Boro*).
- **1950 to present trajectory**: Bangladesh's population rose from **~40 million in 1950** (UN WPP 1950 baseline: `39.7M–40.5M`) to **~175 million today**, while its urban population share expanded from `~4%` in 1950 to `~41%` today and total fertility declined from `~6.8` births per woman (1970) to replacement level (`~1.9–2.0`).

### Scene 06 — The Ural & Permafrost Divide
- **Permafrost constraint**: Approximately **`65%`** of Russia's land area lies over continuous, discontinuous, or sporadic permafrost across Siberia and the Far East, limiting deep-soil agriculture and high-density urban infrastructure.
- **European Russia core**: West of the Ural Mountains, **European Russia** encompasses roughly **`3.96 million km²`** (**`23%`** of national territory) yet concentrates **over `75%`** (`~75%–78%`, ~108–112 million) of Russia's **`144 million`** citizens, anchored by milder Atlantic-moderated climate and the fertile *Chernozem* (Black Earth) steppe.

### Scene 07 — Counterfactual Density Swap
- **Russia at Bangladesh's density (`>20.1 Billion`)**:
  - Total-area scaling: `17,098,246 km² × (175,000,000 / 148,460) = 20,154,884,000` (**`20.15 billion`** people).
  - Dry-land scaling: `16,376,870 km² × 1,330 / km² = 21,781,237,100` (**`21.78 billion`** people).
  - Under either basis, Russia would hold **over `20.1 billion` people**—roughly **`2.5×` Earth's ~8.15 billion human population**.
- **Bangladesh at Russia's density (`1.25 Million`)**:
  - `148,460 km² × (144,200,000 / 17,098,246) = 1,252,054` (**`1.25 million`** people total across the entire nation)—less than a tenth of **Dhaka District** alone (`~14.7 million` residents within `1,464 km²`).

### Scene 08 — Synthesis Summary
- Contrasts cartographic scale (`17.1M km²` vs. `148,460 km²`) against environmental carrying capacity: riverine silt replenishment and tropical monsoons concentrate `175 million` people in the Bengal Delta, whereas high-latitude permafrost focuses `75%+` of Russia's `144 million` citizens into its western European plain.
